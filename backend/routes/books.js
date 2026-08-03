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
import { isR2Configured, uploadToR2 } from '../r2Storage.js';
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

  if (book.id) {
    // ALWAYS serve files through Render API proxy — never expose R2 URLs directly
    // to frontend. PDF.js uses fetch() which is CORS-blocked on R2 public URLs.
    // The Render /:id/file route proxies from R2 server-side (no CORS issue).
    file_url = `${baseUrl}/api/books/${book.id}/file`;

    // Covers can use R2 directly — <img> tags are not CORS-restricted
    // But rewrite legacy Supabase URLs to go through Render cover endpoint
    if (cover && /supabase\.co/i.test(cover)) {
      cover = `${baseUrl}/api/books/${book.id}/cover`;
    }
    // If cover is missing entirely, use Render cover endpoint (will redirect to R2 or serve placeholder)
    if (!cover) {
      cover = `${baseUrl}/api/books/${book.id}/cover`;
    }
  }

  return { ...book, cover, file_url };
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
    const book = rows[0];
    // NOTE: Do NOT null-out cover here — covers may be in R2 (not local disk)
    // normalizeBookUrls will route covers through Render cover endpoint if needed
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
      // DB offline or missing column — skip duplicate detection
      if (hashErr.code !== '42703') {
        console.warn('Duplicate check skipped (DB offline):', hashErr.message);
      }
    }

    // Upload to Cloudflare R2 SYNCHRONOUSLY before responding
    // (R2 uses file streams so it's memory-safe — OOM was caused by PDFDocument.load, not this)
    // This ensures files survive Render redeploys which wipe the ephemeral disk
    let fileUrl = `${baseUrl}/api/books/${bookData.id}/file`;
    let coverUrl = coverPath
      ? `${baseUrl}/api/books/${bookData.id}/cover`
      : null;

    if (isR2Configured()) {
      try {
        const fmt = bookData.format || 'epub';
        const fileKey = `books/${bookData.id}.${fmt}`;
        const fileMime = fmt === 'pdf' ? 'application/pdf' : 'application/epub+zip';
        const savedFilePath = req.file.path;

        const r2FileUrl = await uploadToR2(savedFilePath, fileKey, fileMime);
        if (r2FileUrl) fileUrl = r2FileUrl;

        if (coverPath) {
          const isPng = coverPath.toLowerCase().endsWith('.png');
          const ext = isPng ? 'png' : 'jpg';
          const coverKey = `covers/${bookData.id}.${ext}`;
          const coverMime = isPng ? 'image/png' : 'image/jpeg';
          const r2CoverUrl = await uploadToR2(coverPath, coverKey, coverMime);
          if (r2CoverUrl) coverUrl = r2CoverUrl;
        }

        if (global.gc) global.gc();
      } catch (r2Err) {
        console.warn('R2 upload error (falling back to Render API URLs):', r2Err.message);
      }
    }

    // Try DB insert, but don't fail the upload if DB is offline
    let dbBook = null;
    try {
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
      dbBook = rows[0];
    } catch (dbErr) {
      console.warn('DB insert failed (saved locally):', dbErr.message);
    }

    // Always save to local metadata so disk fallback shows real titles
    await updateLocalMetadata(bookData.id, {
      title: bookData.title,
      author: bookData.author || null,
    });

    // Clean up temporary local files after uploading to R2 to save disk & RAM space on Render
    if (isR2Configured()) {
      try {
        if (coverPath) await fs.unlink(coverPath).catch(() => {});
        // Also remove local pdf/epub copy if saved in BOOKS_DIR/uploads to keep disk light
        if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
      } catch { }
    }

    if (dbBook) {
      res.status(201).json(normalizeBookUrls(dbBook, baseUrl));
    } else {
      // Return a local-only response
      res.status(201).json({
        id: bookData.id,
        title: bookData.title,
        author: bookData.author || null,
        cover: coverUrl,
        file_url: fileUrl,
        format: bookData.format || 'epub',
        added_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('Upload book error:', err);
    res.status(500).json({ error: err.message });
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

  // Fallback: Check if file_url in DB points to R2 — stream-proxy through Render (avoids CORS)
  try {
    const { rows } = await query('SELECT format, file_url, file_data FROM books WHERE id = $1', [id]);
    if (rows.length > 0) {
      const row = rows[0];
      let r2Url = null;

      if (row.file_url && /r2\.dev|r2\.cloudflarestorage\.com/i.test(row.file_url)) {
        r2Url = row.file_url;
      } else {
        const r2PublicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL || 'https://pub-71d570ca196945939ec117bf558c4c0d.r2.dev').replace(/\/$/, '');
        if (r2PublicBase) {
          const fmt = row.format || 'pdf';
          r2Url = `${r2PublicBase}/books/${id}.${fmt}`;
        }
      }

      if (r2Url) {
        // Stream-proxy via https — zero memory buffering
        const fmt = row.format || 'pdf';
        const contentType = fmt === 'pdf' ? 'application/pdf' : 'application/epub+zip';
        const https = await import('https');
        const reqMethod = req.method === 'HEAD' ? 'HEAD' : 'GET';
        
        const r2Req = https.default.request(r2Url, { method: reqMethod }, (r2Res) => {
          if (r2Res.statusCode === 200) {
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('Access-Control-Allow-Origin', '*');
            if (r2Res.headers['content-length']) {
              res.setHeader('Content-Length', r2Res.headers['content-length']);
            }
            if (req.method === 'HEAD') {
              return res.status(200).end();
            }
            r2Res.pipe(res);
          } else {
            res.status(404).send('File not found in R2');
          }
        });
        r2Req.on('error', () => res.status(502).send('R2 fetch error'));
        r2Req.end();
        return;
      }

      // Last resort: bytea from DB
      if (row.file_data) {
        const ext = row.format === 'pdf' ? '.pdf' : '.epub';
        const contentType = ext === '.pdf' ? 'application/pdf' : 'application/epub+zip';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.send(row.file_data);
      }
    }
  } catch (err) {
    console.warn('File DB/R2 fallback error:', err.message);
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

    // 2. Fallback: redirect directly to R2 (no HEAD probe — just redirect and let browser handle 404)
    const r2PublicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL || 'https://pub-71d570ca196945939ec117bf558c4c0d.r2.dev').replace(/\/$/, '');
    if (r2PublicBase) {
      // Try DB first to get the exact cover URL stored after background upload
      try {
        const { rows } = await query('SELECT cover, cover_data FROM books WHERE id = $1', [id]);
        if (rows.length > 0) {
          const row = rows[0];
          // If DB already stores an R2 URL, redirect to it directly
          if (row.cover && /r2\.dev|r2\.cloudflarestorage\.com/i.test(row.cover)) {
            return res.redirect(row.cover);
          }
          // Fallback: redirect to known R2 pattern (covers uploaded as .png by default for PDFs, .jpg for EPUBs)
          // Try .png first (most common since PDF covers are rendered as PNG)
          return res.redirect(`${r2PublicBase}/covers/${id}.png`);
        }
      } catch { }
      // No DB row — still try R2 directly
      return res.redirect(`${r2PublicBase}/covers/${id}.png`);
    }

    // 3. Check DB cover URL for R2 redirect
    try {
      const { rows } = await query('SELECT cover, cover_data FROM books WHERE id = $1', [id]);
      if (rows.length > 0) {
        if (rows[0].cover && /r2\.dev|r2\.cloudflarestorage\.com/i.test(rows[0].cover)) {
          return res.redirect(rows[0].cover);
        }
        if (rows[0].cover_data) {
          res.setHeader('Content-Type', 'image/jpeg');
          return res.send(rows[0].cover_data);
        }
      }
    } catch { }

    res.status(404).send('Cover not found');
  } catch (err) {
    console.error('Get cover error:', err);
    res.status(500).send('Error');
  }
});

router.patch('/:id/progress', async (req, res) => {
  try {
    const { last_cfi, progress_percent, total_pages } = req.body;
    try {
      await query(
        `UPDATE books SET last_cfi = COALESCE($2, last_cfi), last_read = now(),
         progress_percent = COALESCE($3, progress_percent), total_pages = COALESCE($4, total_pages)
         WHERE id = $1`,
        [req.params.id, last_cfi ?? null, progress_percent ?? null, total_pages ?? null]
      );
    } catch (dbErr) {
      // Silently ignore DB errors when offline — progress is also tracked in-memory on the frontend
    }
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
