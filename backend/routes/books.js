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
import {
  isSupabaseEnabled,
  uploadBookFile,
  uploadCover,
  deleteBookFile,
  deleteCover,
  isSupabaseUrl,
  getBookFilePublicUrl,
} from '../supabaseStorage.js';

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

function rewriteLegacyLocalhostUrl(value, baseUrl) {
  if (!value || typeof value !== 'string') return value;
  return value
    .replace(/^http:\/\/localhost:3001/i, baseUrl)
    .replace(/^http:\/\/127\.0\.0\.1:3001/i, baseUrl);
}

function normalizeBookUrls(book, baseUrl) {
  if (!book) return book;
  return {
    ...book,
    cover: rewriteLegacyLocalhostUrl(book.cover, baseUrl),
    file_url: rewriteLegacyLocalhostUrl(book.file_url, baseUrl),
  };
}

const REPAIR_RATE_WINDOW_MS = 30_000;
const REPAIR_RATE_MAX = 8;
const repairRateByIp = new Map();
let repairQueue = Promise.resolve();

function isRepairRateLimited(ip) {
  const now = Date.now();
  const recent = (repairRateByIp.get(ip) || []).filter((ts) => now - ts < REPAIR_RATE_WINDOW_MS);
  if (recent.length >= REPAIR_RATE_MAX) {
    repairRateByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  repairRateByIp.set(ip, recent);
  return false;
}

function enqueueRepairJob(job) {
  const run = repairQueue.then(() => job());
  // Keep queue alive even if one job fails.
  repairQueue = run.catch(() => {});
  return run;
}

async function coverFileExists(book) {
  if (!book) return false;
  if (book.cover && isSupabaseUrl(book.cover)) return true;
  const bookId = typeof book === 'string' ? book : book.id;
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

async function bookFileExists(book) {
  if (!book?.id || !book.format) return false;
  if (book.file_url && isSupabaseUrl(book.file_url)) return true;
  const ext = book.format === 'pdf' ? '.pdf' : '.epub';
  try {
    await fs.access(path.join(BOOKS_DIR, `${book.id}${ext}`));
    return true;
  } catch {
    return false;
  }
}

router.get('/', async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    const { rows } = await query(
      'SELECT * FROM books ORDER BY added_at DESC'
    );
    const valid = [];
    for (const b of rows) {
      if (!(await bookFileExists(b))) {
        await query('DELETE FROM books WHERE id = $1', [b.id]);
        continue;
      }
      if (b.cover && !(await coverFileExists(b))) {
        await query('UPDATE books SET cover = NULL WHERE id = $1', [b.id]);
        valid.push(normalizeBookUrls({ ...b, cover: null }, baseUrl));
      } else {
        valid.push(normalizeBookUrls(b, baseUrl));
      }
    }
    res.json(valid);
  } catch (err) {
    console.error('Fetch books error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    const { rows } = await query('SELECT * FROM books WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Book not found' });
    let book = rows[0];
    if (book.cover && !(await coverFileExists(book))) {
      await query('UPDATE books SET cover = NULL WHERE id = $1', [book.id]);
      book = { ...book, cover: null };
    }
    res.json(normalizeBookUrls(book, baseUrl));
  } catch (err) {
    console.error('Get book error:', err);
    res.status(500).json({ error: err.message });
  }
});

/** Import a book that exists in Supabase Storage but has no DB record (orphaned upload). */
router.post('/import-orphan', async (req, res) => {
  try {
    if (!isSupabaseEnabled()) {
      return res.status(400).json({ error: 'Supabase Storage is not configured' });
    }
    const { bookId } = req.body;
    if (!bookId || typeof bookId !== 'string') {
      return res.status(400).json({ error: 'bookId is required' });
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(bookId.trim())) {
      return res.status(400).json({ error: 'Invalid bookId format (expected UUID)' });
    }
    const id = bookId.trim();

    // Check if already in DB
    const { rows: existing } = await query('SELECT id FROM books WHERE id = $1', [id]);
    if (existing.length) {
      return res.status(409).json({ error: 'Book already in library', book: existing[0] });
    }

    // Try PDF first, then EPUB
    let fileUrl = null;
    let format = null;
    for (const fmt of ['pdf', 'epub']) {
      const url = getBookFilePublicUrl(id, fmt);
      const resp = await fetch(url);
      if (resp.ok) {
        fileUrl = url;
        format = fmt;
        break;
      }
    }
    if (!fileUrl || !format) {
      return res.status(404).json({
        error: 'File not found in Supabase Storage. Ensure the file exists in the Books bucket (e.g. <uuid>.pdf or <uuid>.epub).',
      });
    }

    // Fetch file and extract metadata (filename must be {id}.ext so processUpload gets correct id)
    const resp = await fetch(fileUrl);
    const fileBuffer = Buffer.from(await resp.arrayBuffer());
    const ext = format === 'pdf' ? '.pdf' : '.epub';
    const tmpPath = path.join(BOOKS_DIR, `${id}${ext}`);
    await fs.writeFile(tmpPath, fileBuffer);

    let bookData;
    let coverPath = null;
    try {
      const result = await processUpload(tmpPath, BOOKS_DIR, COVERS_DIR);
      bookData = result.bookData;
      coverPath = result.coverPath;
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }

    let coverUrl = null;
    if (coverPath) {
      const coverBuf = await fs.readFile(coverPath);
      const coverExt = path.extname(coverPath).toLowerCase();
      coverUrl = await uploadCover(id, coverBuf, coverExt);
      await fs.unlink(coverPath).catch(() => {});
    }

    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const baseUrl = getBaseUrl(req);

    try {
      await query(
        `INSERT INTO books (id, title, author, cover, file_url, format, file_hash, added_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
        [bookData.id, bookData.title, bookData.author || null, coverUrl, fileUrl, format, fileHash]
      );
    } catch (insertErr) {
      if (insertErr.code === '42703') {
        await query(
          `INSERT INTO books (id, title, author, cover, file_url, format, added_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())`,
          [bookData.id, bookData.title, bookData.author || null, coverUrl, fileUrl, format]
        );
      } else {
        throw insertErr;
      }
    }

    const { rows } = await query('SELECT * FROM books WHERE id = $1', [id]);
    res.status(201).json(normalizeBookUrls(rows[0], baseUrl));
  } catch (err) {
    console.error('Import orphan error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  let bookData, uploadedToSupabase = false;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const baseUrl = getBaseUrl(req);
    const processed = await processUpload(req.file.path, BOOKS_DIR, COVERS_DIR);
    bookData = processed.bookData;
    const coverPath = processed.coverPath;

    // Calculate file hash for duplicate detection (requires file_hash column in DB)
    const fileBuffer = await fs.readFile(req.file.path);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Try to check for duplicates using file_hash (only works if column exists)
    try {
      const { rows: existingBooks } = await query(
        'SELECT id, added_at, format FROM books WHERE file_hash = $1 ORDER BY added_at ASC',
        [fileHash]
      );

      // Delete any older duplicate books with the same file hash
      for (const existingBook of existingBooks) {
        console.log(`Deleting duplicate book ${existingBook.id}, keeping newer upload`);
        const { rows: dup } = await query('SELECT file_url FROM books WHERE id = $1', [existingBook.id]);
        if (dup[0]?.file_url && isSupabaseUrl(dup[0].file_url)) {
          await deleteBookFile(existingBook.id, existingBook.format).catch(() => {});
          await deleteCover(existingBook.id).catch(() => {});
        } else {
          const ext = existingBook.format === 'pdf' ? '.pdf' : '.epub';
          await fs.unlink(path.join(BOOKS_DIR, `${existingBook.id}${ext}`)).catch(() => {});
        }
        await query('DELETE FROM books WHERE id = $1', [existingBook.id]);
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

    let fileUrl;
    let coverUrl = null;

    if (isSupabaseEnabled()) {
      fileUrl = await uploadBookFile(bookData.id, bookData.format, fileBuffer);
      if (coverPath) {
        const coverBuf = await fs.readFile(coverPath);
        const coverExt = path.extname(coverPath).toLowerCase();
        coverUrl = await uploadCover(bookData.id, coverBuf, coverExt);
      }
      await fs.unlink(req.file.path).catch(() => {});
      if (coverPath) await fs.unlink(coverPath).catch(() => {});
      uploadedToSupabase = true;
    } else {
      fileUrl = `${baseUrl}/api/books/${bookData.id}/file`;
      coverUrl = coverPath ? `${baseUrl}/api/books/${bookData.id}/cover` : null;
    }

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
    res.status(201).json(normalizeBookUrls(rows[0], baseUrl));
  } catch (err) {
    // If we uploaded to Supabase but INSERT failed, remove the orphan
    if (typeof uploadedToSupabase !== 'undefined' && uploadedToSupabase && bookData) {
      await deleteBookFile(bookData.id, bookData.format).catch((e) => console.warn('Orphan cleanup:', e?.message));
      await deleteCover(bookData.id).catch(() => {});
    }
    console.error('Upload book error:', err);
    res.status(500).json({ error: err.message });
  }
});

/** Convert EPUB to PDF and serve. Caches result as {id}_converted.pdf (local) or temp (Supabase). */
router.get('/:id/pdf', async (req, res) => {
  try {
    const { rows } = await query('SELECT id, format, file_url FROM books WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).send('Book not found');
    const book = rows[0];
    if (book.format !== 'epub') {
      return res.status(400).json({ error: 'Only EPUB books can be converted to PDF' });
    }

    let epubPath = path.join(BOOKS_DIR, `${book.id}.epub`);
    const pdfPath = path.join(BOOKS_DIR, `${book.id}_converted.pdf`);
    let tempEpub = false;

    if (book.file_url && isSupabaseUrl(book.file_url)) {
      const resp = await fetch(book.file_url);
      if (!resp.ok) return res.status(404).send('EPUB file not found');
      const buf = Buffer.from(await resp.arrayBuffer());
      epubPath = path.join(BOOKS_DIR, `temp_${book.id}.epub`);
      await fs.writeFile(epubPath, buf);
      tempEpub = true;
    } else {
      try {
        await fs.access(epubPath);
      } catch {
        return res.status(404).send('EPUB file not found');
      }
    }

    let outPath = pdfPath;
    if (tempEpub) {
      outPath = path.join(BOOKS_DIR, `temp_${book.id}_converted.pdf`);
    } else {
      try {
        await fs.access(pdfPath);
        outPath = pdfPath;
      } catch {
        // need to convert
      }
    }

    try {
      await fs.access(outPath);
    } catch {
      try {
        await convertEpubToPdf(epubPath, outPath);
      } catch (err) {
        if (tempEpub) await fs.unlink(epubPath).catch(() => {});
        console.error('EPUB to PDF conversion error:', err);
        return res.status(500).json({ error: err.message || 'Conversion failed' });
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(path.resolve(outPath));
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
  const ip = String((req.get('x-forwarded-for') || req.ip || 'unknown')).split(',')[0].trim();
  if (isRepairRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many cover repair requests. Please wait and try again.' });
  }

  try {
    await enqueueRepairJob(async () => {
      const { rows } = await query('SELECT id, format, file_url FROM books WHERE id = $1', [req.params.id]);
      if (!rows.length) {
        res.status(404).json({ error: 'Book not found' });
        return;
      }

      const book = rows[0];
      const ext = book.format === 'pdf' ? '.pdf' : '.epub';
      let filePath = path.join(BOOKS_DIR, `${book.id}${ext}`);

      if (book.file_url && isSupabaseUrl(book.file_url)) {
        const resp = await fetch(book.file_url);
        if (!resp.ok) {
          res.status(404).json({ error: 'File not found' });
          return;
        }
        const buf = Buffer.from(await resp.arrayBuffer());
        filePath = path.join(BOOKS_DIR, `temp_${book.id}${ext}`);
        await fs.writeFile(filePath, buf);
      } else {
        try {
          await fs.access(filePath);
        } catch {
          res.status(404).json({ error: 'File not found' });
          return;
        }
      }

      const { extractCover } = await import('../fileProcessor.js');
      const coverPath = await extractCover(filePath, book.id, book.format, COVERS_DIR);

      if (filePath.includes('temp_')) await fs.unlink(filePath).catch(() => {});

      if (coverPath) {
        if (isSupabaseEnabled()) {
          const coverBuf = await fs.readFile(coverPath);
          const coverExt = path.extname(coverPath).toLowerCase();
          const coverUrl = await uploadCover(book.id, coverBuf, coverExt);
          await query('UPDATE books SET cover = $2 WHERE id = $1', [book.id, coverUrl]);
          await fs.unlink(coverPath).catch(() => {});
        } else {
          const baseUrl = getBaseUrl(req);
          const coverUrl = `${baseUrl}/api/books/${book.id}/cover`;
          await query('UPDATE books SET cover = $2 WHERE id = $1', [book.id, coverUrl]);
        }
      }

      const { rows: updated } = await query('SELECT * FROM books WHERE id = $1', [book.id]);
      const baseUrl = getBaseUrl(req);
      res.json(normalizeBookUrls(updated[0], baseUrl));
    });
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
    const { rows } = await query('SELECT format, file_url FROM books WHERE id = $1', [req.params.id]);
    if (rows.length) {
      if (rows[0].file_url && isSupabaseUrl(rows[0].file_url)) {
        await deleteBookFile(req.params.id, rows[0].format).catch(() => {});
        await deleteCover(req.params.id).catch(() => {});
      } else {
        const ext = rows[0].format === 'pdf' ? '.pdf' : '.epub';
        await fs.unlink(path.join(BOOKS_DIR, `${req.params.id}${ext}`)).catch(() => {});
        if (rows[0].format === 'epub') {
          await fs.unlink(path.join(BOOKS_DIR, `${req.params.id}_converted.pdf`)).catch(() => {});
        }
        for (const e of ['.jpg', '.jpeg', '.png', '.gif', '.webp']) {
          await fs.unlink(path.join(COVERS_DIR, `${req.params.id}${e}`)).catch(() => {});
        }
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
