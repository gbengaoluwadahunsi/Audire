import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db.js';
import { processUpload } from '../fileProcessor.js';
import { convertEpubToPdf } from '../epubToPdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

const UPLOAD_BASE = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const BOOKS_DIR = path.join(UPLOAD_BASE, 'books');
const COVERS_DIR = path.join(UPLOAD_BASE, 'covers');

async function ensureDirs() {
  await fs.mkdir(BOOKS_DIR, { recursive: true });
  await fs.mkdir(COVERS_DIR, { recursive: true });
}
ensureDirs();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, BOOKS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.epub';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    if (ext.endsWith('.epub') || ext.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only EPUB and PDF files allowed'));
    }
  },
});

function getBaseUrl(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3001';
  return `${proto}://${host}`;
}

async function coverFileExists(bookId) {
  const exts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  for (const ext of exts) {
    try {
      await fs.access(path.join(COVERS_DIR, `${bookId}${ext}`));
      return true;
    } catch {
      // file not found, continue to next
    }
  }
  const files = await fs.readdir(COVERS_DIR).catch(() => []);
  return files.some((f) => f.startsWith(bookId) && /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM books ORDER BY added_at DESC'
    );
    const withValidCovers = await Promise.all(rows.map(async (b) => {
      if (b.cover && !(await coverFileExists(b.id))) {
        await query('UPDATE books SET cover = NULL WHERE id = $1', [b.id]);
        return { ...b, cover: null };
      }
      return b;
    }));
    res.json(withValidCovers);
  } catch (err) {
    console.error('Fetch books error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM books WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Book not found' });
    let book = rows[0];
    if (book.cover && !(await coverFileExists(book.id))) {
      await query('UPDATE books SET cover = NULL WHERE id = $1', [book.id]);
      book = { ...book, cover: null };
    }
    res.json(book);
  } catch (err) {
    console.error('Get book error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const baseUrl = getBaseUrl(req);
    const { bookData, coverPath } = await processUpload(req.file.path, BOOKS_DIR, COVERS_DIR);

    // Calculate file hash for duplicate detection (requires file_hash column in DB)
    const fileBuffer = await fs.readFile(req.file.path);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Try to check for duplicates using file_hash (only works if column exists)
    try {
      const { rows: existingBooks } = await query(
        'SELECT id, added_at FROM books WHERE file_hash = $1 ORDER BY added_at ASC',
        [fileHash]
      );

      // Delete any older duplicate books with the same file hash
      for (const existingBook of existingBooks) {
        console.log(`Deleting duplicate book ${existingBook.id}, keeping newer upload`);
        await query('DELETE FROM books WHERE id = $1', [existingBook.id]);
        // Also delete the associated book file if it exists
        const bookFilePath = path.join(BOOKS_DIR, `${existingBook.id}${bookData.format === 'pdf' ? '.pdf' : '.epub'}`);
        await fs.unlink(bookFilePath).catch(() => {});
      }
    } catch (hashErr) {
      // file_hash column doesn't exist yet - that's OK, duplicate detection will work once schema is updated
      if (hashErr.code === '42703') {
        // Column not found error, silently continue
        console.log('file_hash column not yet in database, skipping duplicate detection');
      } else {
        throw hashErr;
      }
    }

    const fileUrl = `${baseUrl}/api/books/${bookData.id}/file`;
    const coverUrl = coverPath
      ? `${baseUrl}/api/books/${bookData.id}/cover`
      : null;

    // Try to INSERT with file_hash first, fall back without if column doesn't exist
    try {
      await query(
        `INSERT INTO books (id, title, author, cover, file_url, format, file_hash, added_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
        [
          bookData.id,
          bookData.title,
          bookData.author || null,
          coverUrl,
          fileUrl,
          bookData.format || 'epub',
          fileHash,
        ]
      );
    } catch (insertErr) {
      // If file_hash column doesn't exist, retry without it
      if (insertErr.code === '42703') {
        await query(
          `INSERT INTO books (id, title, author, cover, file_url, format, added_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())`,
          [
            bookData.id,
            bookData.title,
            bookData.author || null,
            coverUrl,
            fileUrl,
            bookData.format || 'epub',
          ]
        );
      } else {
        throw insertErr;
      }
    }

    const { rows } = await query('SELECT * FROM books WHERE id = $1', [bookData.id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Upload book error:', err);
    res.status(500).json({ error: err.message });
  }
});

/** Convert EPUB to PDF and serve. Caches result as {id}_converted.pdf */
router.get('/:id/pdf', async (req, res) => {
  try {
    const { rows } = await query('SELECT id, format FROM books WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).send('Book not found');
    const book = rows[0];
    if (book.format !== 'epub') {
      return res.status(400).json({ error: 'Only EPUB books can be converted to PDF' });
    }

    const epubPath = path.join(BOOKS_DIR, `${book.id}.epub`);
    const pdfPath = path.join(BOOKS_DIR, `${book.id}_converted.pdf`);

    try {
      await fs.access(epubPath);
    } catch {
      return res.status(404).send('EPUB file not found');
    }

    try {
      await fs.access(pdfPath);
    } catch {
      try {
        await convertEpubToPdf(epubPath, pdfPath);
      } catch (err) {
        console.error('EPUB to PDF conversion error:', err);
        return res.status(500).json({ error: err.message || 'Conversion failed' });
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(path.resolve(pdfPath));
  } catch (err) {
    console.error('Get PDF error:', err);
    res.status(500).send('Error');
  }
});

router.get('/:id/file', async (req, res) => {
  try {
    const { rows } = await query('SELECT format FROM books WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).send('Book not found');

    const ext = rows[0].format === 'pdf' ? '.pdf' : '.epub';
    const filePath = path.join(BOOKS_DIR, `${req.params.id}${ext}`);
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).send('File not found');
    }
    const contentType = ext === '.pdf' ? 'application/pdf' : 'application/epub+zip';
    res.sendFile(filePath, { headers: { 'Content-Type': contentType } });
  } catch (err) {
    console.error('Get file error:', err);
    res.status(500).send('Error');
  }
});

router.get('/:id/cover', async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: 'Invalid book ID' });
    }
    const exts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    for (const ext of exts) {
      const coverPath = path.join(COVERS_DIR, `${id}${ext}`);
      try {
        await fs.access(coverPath);
        return res.sendFile(path.resolve(coverPath));
      } catch {
        // path not found, continue to next
      }
    }
    // Fallback: find any file starting with book id (handles odd extensions)
    const files = await fs.readdir(COVERS_DIR).catch(() => []);
    const match = files.find((f) => f.startsWith(id) && /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    if (match) {
      return res.sendFile(path.resolve(path.join(COVERS_DIR, match)));
    }
    // Clear stale cover URL so frontend can retry repair
    await query('UPDATE books SET cover = NULL WHERE id = $1 AND cover IS NOT NULL', [id]);
    res.status(404).send('Cover not found');
  } catch (err) {
    console.error('Get cover error:', err);
    res.status(500).send('Error');
  }
});

router.post('/:id/repair-cover', async (req, res) => {
  try {
    const { rows } = await query('SELECT id, format FROM books WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Book not found' });

    const book = rows[0];
    const ext = book.format === 'pdf' ? '.pdf' : '.epub';
    const filePath = path.join(BOOKS_DIR, `${book.id}${ext}`);
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    const { extractCover } = await import('../fileProcessor.js');
    const coverPath = await extractCover(filePath, book.id, book.format, COVERS_DIR);
    
    // If cover could be extracted, update the database
    if (coverPath) {
      const baseUrl = getBaseUrl(req);
      const coverUrl = `${baseUrl}/api/books/${book.id}/cover`;
      await query('UPDATE books SET cover = $2 WHERE id = $1', [book.id, coverUrl]);
    }

    const { rows: updated } = await query('SELECT * FROM books WHERE id = $1', [book.id]);
    res.json(updated[0]);
  } catch (err) {
    console.error('Repair cover error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/progress', async (req, res) => {
  try {
    const { last_cfi, progress_percent, total_pages } = req.body;
    await query(
      `UPDATE books SET last_cfi = COALESCE($2, last_cfi), last_read = now(),
       progress_percent = COALESCE($3, progress_percent), total_pages = COALESCE($4, total_pages)
       WHERE id = $1`,
      [req.params.id, last_cfi ?? null, progress_percent ?? null, total_pages ?? null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Update progress error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT format FROM books WHERE id = $1', [req.params.id]);
    if (rows.length) {
      const ext = rows[0].format === 'pdf' ? '.pdf' : '.epub';
      const filePath = path.join(BOOKS_DIR, `${req.params.id}${ext}`);
      await fs.unlink(filePath).catch(() => {});
      if (rows[0].format === 'epub') {
        await fs.unlink(path.join(BOOKS_DIR, `${req.params.id}_converted.pdf`)).catch(() => {});
      }
      for (const e of ['.jpg', '.jpeg', '.png', '.gif', '.webp']) {
        await fs.unlink(path.join(COVERS_DIR, `${req.params.id}${e}`)).catch(() => {});
      }
    }
    await query('DELETE FROM books WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete book error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
