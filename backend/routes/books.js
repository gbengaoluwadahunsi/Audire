import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db.js';
import { processUpload } from '../fileProcessor.js';
import { convertEpubToPdf } from '../epubToPdf.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
// Supabase is now fully removed, using Neon + Local Storage

const UPLOAD_BASE = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const BOOKS_DIR = path.join(UPLOAD_BASE, 'books');
const COVERS_DIR = path.join(UPLOAD_BASE, 'covers');

async function ensureDirs() {
  await fs.mkdir(BOOKS_DIR, { recursive: true });
  await fs.mkdir(COVERS_DIR, { recursive: true });
}
ensureDirs();

const METADATA_FILE = path.join(UPLOAD_BASE, 'metadata.json');

async function readLocalMetadata() {
  try {
    const data = await fs.readFile(METADATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeLocalMetadata(meta) {
  await fs.writeFile(METADATA_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

async function updateLocalMetadata(bookId, updates) {
  const meta = await readLocalMetadata();
  meta[bookId] = { ...(meta[bookId] || {}), ...updates };
  await writeLocalMetadata(meta);
  return meta[bookId];
}

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
  limits: { fileSize: 50 * 1024 * 1024 },
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

// IMPORTANT: Never use SELECT * on books table - the file_data/cover_data columns
// contain entire book binaries and will cause OOM on memory-constrained servers.
const BOOK_COLS = 'id, title, author, cover, file_url, format, file_hash, added_at, last_cfi, last_read, progress_percent, total_pages';

function normalizeBookUrls(book, baseUrl) {
  if (!book) return book;

  let cover = rewriteLegacyLocalhostUrl(book.cover, baseUrl);
  let file_url = rewriteLegacyLocalhostUrl(book.file_url, baseUrl);

  // Legacy Supabase URLs no longer resolve — serve from this API instead
  if (book.id) {
    if (!file_url || /supabase\.co/i.test(file_url)) {
      file_url = `${baseUrl}/api/books/${book.id}/file`;
    }
    if (cover && /supabase\.co/i.test(cover)) {
      cover = `${baseUrl}/api/books/${book.id}/cover`;
    }
  }

  return { ...book, cover, file_url };
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
  repairQueue = run.catch(() => { });
  return run;
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
  const baseUrl = getBaseUrl(req);
  try {
    const { rows } = await query(
      `SELECT ${BOOK_COLS} FROM books ORDER BY added_at DESC`
    );
    res.json(rows.map(b => normalizeBookUrls(b, baseUrl)));
  } catch (err) {
    console.warn('Fetch books database error (falling back to local disk files):', err.message);
    try {
      const files = await fs.readdir(BOOKS_DIR).catch(() => []);
      const allLocalMeta = await readLocalMetadata();
      const diskBooks = [];
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (ext !== '.epub' && ext !== '.pdf') continue;
        const id = path.basename(file, ext);
        const stats = await fs.stat(path.join(BOOKS_DIR, file)).catch(() => null);
        const hasCover = await coverFileExists(id);
        
        // Use local metadata for title/author if available
        const localMeta = allLocalMeta[id] || {};
        const cleanTitle = localMeta.title
          || (id.length === 36 && id.includes('-') 
            ? `${ext.slice(1).toUpperCase()} Document` 
            : path.basename(file, ext));

        diskBooks.push({
          id,
          title: cleanTitle,
          author: localMeta.author || 'Local Library',
          cover: hasCover ? `${baseUrl}/api/books/${id}/cover` : null,
          file_url: `${baseUrl}/api/books/${id}/file`,
          format: ext.slice(1),
          added_at: stats?.mtime || new Date(),
          progress_percent: 0,
        });
      }
      res.json(diskBooks.map(b => normalizeBookUrls(b, baseUrl)));
    } catch (fallbackErr) {
      console.error('Disk fallback error:', fallbackErr);
      res.status(500).json({ error: err.message });
    }
  }
});

router.get('/:id', async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    const { rows } = await query(`SELECT ${BOOK_COLS} FROM books WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Book not found' });
    let book = rows[0];
    if (book.cover && !(await coverFileExists(book.id))) {
      await query('UPDATE books SET cover = NULL WHERE id = $1', [book.id]);
      book = { ...book, cover: null };
    }
    res.json(normalizeBookUrls(book, baseUrl));
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

    // Calculate file hash using streaming (memory-efficient)
    const fileHash = await new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(req.file.path);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });

    // NEVER store giant binary file data inside PostgreSQL bytea columns (prevents Neon DB limit inflation)
    let fileBuffer = null;
    let coverBuffer = null;

    // Try to check for duplicates using file_hash
    try {
      const { rows: existingBooks } = await query(
        'SELECT id, added_at FROM books WHERE file_hash = $1 ORDER BY added_at ASC',
        [fileHash]
      );

      for (const existingBook of existingBooks) {
        console.log(`Deleting duplicate book ${existingBook.id}, keeping newer upload`);
        await query('DELETE FROM books WHERE id = $1', [existingBook.id]);
        const bookFilePath = path.join(BOOKS_DIR, `${existingBook.id}${bookData.format === 'pdf' ? '.pdf' : '.epub'}`);
        await fs.unlink(bookFilePath).catch(() => { });
      }
    } catch (hashErr) {
      if (hashErr.code === '42703') {
        console.log('file_hash column not yet in database, skipping duplicate detection');
      } else {
        throw hashErr;
      }
    }

    const fileUrl = `${baseUrl}/api/books/${bookData.id}/file`;
    const coverUrl = coverPath
      ? `${baseUrl}/api/books/${bookData.id}/cover`
      : null;

    try {
      await query(
        `INSERT INTO books (id, title, author, cover, file_url, format, file_hash, file_data, cover_data, added_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
        [
          bookData.id,
          bookData.title,
          bookData.author || null,
          coverUrl,
          fileUrl,
          bookData.format || 'epub',
          fileHash,
          fileBuffer,
          coverBuffer
        ]
      );
    } catch (insertErr) {
      // Fallback for older schemas without binary columns
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
          fileHash
        ]
      );
    }

    const { rows } = await query(`SELECT ${BOOK_COLS} FROM books WHERE id = $1`, [bookData.id]);
    res.status(201).json(normalizeBookUrls(rows[0], baseUrl));
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
  const { id } = req.params;
  
  // First check if physical file exists on local disk
  const pdfPath = path.join(BOOKS_DIR, `${id}.pdf`);
  const epubPath = path.join(BOOKS_DIR, `${id}.epub`);

  try {
    await fs.access(pdfPath);
    return res.sendFile(pdfPath, { headers: { 'Content-Type': 'application/pdf' } });
  } catch { }

  try {
    await fs.access(epubPath);
    return res.sendFile(epubPath, { headers: { 'Content-Type': 'application/epub+zip' } });
  } catch { }

  // Fallback: Check database bytea if present
  try {
    const { rows } = await query('SELECT format, file_data FROM books WHERE id = $1', [id]);
    if (rows.length > 0 && rows[0].file_data) {
      const ext = rows[0].format === 'pdf' ? '.pdf' : '.epub';
      const contentType = ext === '.pdf' ? 'application/pdf' : 'application/epub+zip';
      res.setHeader('Content-Type', contentType);
      return res.send(rows[0].file_data);
    }
  } catch (err) {
    console.warn('File DB query error:', err.message);
  }

  res.status(404).send('File not found');
});

router.get('/:id/cover', async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: 'Invalid book ID' });
    }

    // 1. Try local disk cover first (instant, 0 DB queries)
    const exts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    for (const ext of exts) {
      const coverPath = path.join(COVERS_DIR, `${id}${ext}`);
      try {
        await fs.access(coverPath);
        return res.sendFile(path.resolve(coverPath));
      } catch {
        // path not found, continue
      }
    }
    const files = await fs.readdir(COVERS_DIR).catch(() => []);
    const match = files.find((f) => f.startsWith(id) && /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    if (match) {
      return res.sendFile(path.resolve(path.join(COVERS_DIR, match)));
    }

    // 2. Fallback to Database bytea if present
    try {
      const { rows } = await query('SELECT cover_data FROM books WHERE id = $1', [id]);
      if (rows.length > 0 && rows[0].cover_data) {
        res.setHeader('Content-Type', 'image/jpeg');
        return res.send(rows[0].cover_data);
      }
    } catch { }

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
      let bookFormat = 'pdf';
      let fileExists = false;

      // 1. Try DB lookup first
      try {
        const { rows } = await query('SELECT id, format FROM books WHERE id = $1', [req.params.id]);
        if (rows.length > 0) {
          bookFormat = rows[0].format || 'pdf';
        }
      } catch { }

      // 2. Check local disk files
      const pdfPath = path.join(BOOKS_DIR, `${req.params.id}.pdf`);
      const epubPath = path.join(BOOKS_DIR, `${req.params.id}.epub`);

      let filePath = pdfPath;
      try {
        await fs.access(pdfPath);
        fileExists = true;
        bookFormat = 'pdf';
      } catch {
        try {
          await fs.access(epubPath);
          fileExists = true;
          filePath = epubPath;
          bookFormat = 'epub';
        } catch { }
      }

      if (!fileExists) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const { extractCover } = await import('../fileProcessor.js');
      const coverPath = await extractCover(filePath, book.id, book.format, COVERS_DIR);

      // If cover could be extracted, update the database.
      if (coverPath) {
        const baseUrl = getBaseUrl(req);
        const coverUrl = `${baseUrl}/api/books/${book.id}/cover`;
        await query('UPDATE books SET cover = $2 WHERE id = $1', [book.id, coverUrl]);
      }

      const { rows: updated } = await query(`SELECT ${BOOK_COLS} FROM books WHERE id = $1`, [book.id]);
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

router.patch('/:id/metadata', async (req, res) => {
  try {
    const { title, author } = req.body;
    if (!title && !author) {
      return res.status(400).json({ error: 'title or author is required' });
    }

    // Always save to local metadata file (works offline)
    const localUpdate = {};
    if (title) localUpdate.title = title;
    if (author) localUpdate.author = author;
    await updateLocalMetadata(req.params.id, localUpdate);

    // Try DB update too (may fail if offline)
    try {
      const { rows } = await query(
        `UPDATE books SET title = COALESCE($2, title), author = COALESCE($3, author)
         WHERE id = $1 RETURNING id, title, author, cover, file_url, format, added_at`,
        [req.params.id, title || null, author || null]
      );
      if (rows.length) return res.json(rows[0]);
    } catch (dbErr) {
      console.warn('DB metadata update failed (saved locally):', dbErr.message);
    }

    // Return local metadata if DB failed
    res.json({ id: req.params.id, title: title || null, author: author || null });
  } catch (err) {
    console.error('Update metadata error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/cover', multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, COVERS_DIR),
    filename: (req, file, cb) => cb(null, `${req.params.id}${path.extname(file.originalname || '.jpg')}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp)$/.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed (jpg, png, gif, webp)'));
    }
  },
}).single('cover'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const baseUrl = getBaseUrl(req);
    const coverUrl = `${baseUrl}/api/books/${req.params.id}/cover`;
    // Try DB update but don't fail if offline — cover is already on disk
    try {
      const coverBuffer = await fs.readFile(req.file.path);
      await query(
        'UPDATE books SET cover = $2, cover_data = $3 WHERE id = $1',
        [req.params.id, coverUrl, coverBuffer]
      );
    } catch (dbErr) {
      console.warn('DB cover update failed (saved locally):', dbErr.message);
    }
    res.json({ cover: coverUrl });
  } catch (err) {
    console.error('Upload cover error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/search-metadata', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length < 2) {
      return res.status(400).json({ error: 'title (min 2 chars) is required' });
    }
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(title.trim())}&maxResults=5`
    );
    if (!response.ok) {
      return res.status(502).json({ error: 'Google Books API request failed' });
    }
    const data = await response.json();
    const results = (data.items || []).map((item) => ({
      title: item.volumeInfo?.title || '',
      author: (item.volumeInfo?.authors || []).join(', '),
      cover: item.volumeInfo?.imageLinks?.thumbnail || null,
      description: item.volumeInfo?.description || '',
    }));
    res.json(results);
  } catch (err) {
    console.error('Search metadata error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT format FROM books WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Book not found' });
    if (rows.length) {
      const ext = rows[0].format === 'pdf' ? '.pdf' : '.epub';
      const filePath = path.join(BOOKS_DIR, `${req.params.id}${ext}`);
      await fs.unlink(filePath).catch(() => { });
      if (rows[0].format === 'epub') {
        await fs.unlink(path.join(BOOKS_DIR, `${req.params.id}_converted.pdf`)).catch(() => { });
      }
      for (const e of ['.jpg', '.jpeg', '.png', '.gif', '.webp']) {
        await fs.unlink(path.join(COVERS_DIR, `${req.params.id}${e}`)).catch(() => { });
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
