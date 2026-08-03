/**
 * restoreBookFile.js — put a book's file back into R2 under its existing library row.
 *
 * For books whose bytes were lost (row survived, file never reached R2), this keeps
 * the row — and therefore the reading progress, bookmarks and collections — and only
 * replaces the storage. Uploading the same book through the app would instead create
 * a new row and lose all of that.
 *
 * Usage: node scripts/restoreBookFile.js <bookId> <path/to/file.pdf|.epub> [--cover <path>]
 */
import 'dotenv/config';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { query } from '../db.js';
import { isR2Configured, uploadToR2 } from '../r2Storage.js';

const [, , bookId, filePath, ...rest] = process.argv;
const coverFlag = rest.indexOf('--cover');
const coverPath = coverFlag !== -1 ? rest[coverFlag + 1] : null;

function fail(msg) {
  console.error('✗', msg);
  process.exit(1);
}

if (!bookId || !filePath) {
  fail('Usage: node scripts/restoreBookFile.js <bookId> <path/to/file> [--cover <path>]');
}
if (!isR2Configured()) fail('R2 is not configured — check CLOUDFLARE_R2_* in backend/.env');
if (!fsSync.existsSync(filePath)) fail(`No such file: ${filePath}`);

const ext = path.extname(filePath).toLowerCase().replace('.', '');
if (!['pdf', 'epub'].includes(ext)) fail(`Expected a .pdf or .epub, got .${ext}`);

const { rows } = await query('SELECT id, title, author, format, progress_percent FROM books WHERE id = $1', [bookId]);
if (!rows.length) fail(`No library row with id ${bookId} — nothing to restore into.`);
const book = rows[0];

console.log(`Restoring ${bookId}`);
console.log(`  current title    : ${book.title}`);
console.log(`  reading progress : ${book.progress_percent ?? 0}%`);
console.log(`  source file      : ${filePath} (${(fsSync.statSync(filePath).size / 1048576).toFixed(1)}MB)`);

const fileUrl = await uploadToR2(
  filePath,
  `books/${bookId}.${ext}`,
  ext === 'pdf' ? 'application/pdf' : 'application/epub+zip'
);
if (!fileUrl) fail('R2 upload returned no URL');
console.log(`  → uploaded to books/${bookId}.${ext}`);

// A row whose title is its own UUID never got metadata extracted. Take it from the
// file we are restoring so the library stops showing a UUID as the book name.
let title = book.title;
let author = book.author;
if (title === bookId && ext === 'pdf') {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const silence = console.log;
    console.log = () => { };
    const doc = await PDFDocument.load(await fs.readFile(filePath), { ignoreEncryption: true, updateMetadata: false });
    console.log = silence;
    title = doc.getTitle() || title;
    author = doc.getAuthor() || author;
  } catch {
    // Keep whatever the row already had.
  }
}

let cover = null;
if (coverPath && fsSync.existsSync(coverPath)) {
  const coverExt = path.extname(coverPath).toLowerCase() === '.png' ? 'png' : 'jpg';
  cover = await uploadToR2(
    coverPath,
    `covers/${bookId}.${coverExt}`,
    coverExt === 'png' ? 'image/png' : 'image/jpeg'
  );
  if (cover) console.log(`  → uploaded cover to covers/${bookId}.${coverExt}`);
}

await query(
  `UPDATE books
      SET file_url = $2,
          format   = $3,
          title    = $4,
          author   = COALESCE($5, author),
          cover    = COALESCE($6, cover)
    WHERE id = $1`,
  [bookId, fileUrl, ext, title, author, cover]
);

console.log(`  new title        : ${title}${author ? ` — ${author}` : ''}`);
console.log('✓ restored\n');
process.exit(0);
