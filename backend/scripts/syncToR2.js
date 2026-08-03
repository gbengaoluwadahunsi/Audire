import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isR2Configured, uploadToR2 } from '../r2Storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_BASE = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const BOOKS_DIR = path.join(UPLOAD_BASE, 'books');
const COVERS_DIR = path.join(UPLOAD_BASE, 'covers');

async function syncToR2() {
  if (!isR2Configured()) {
    console.error('R2 not configured. Set CLOUDFLARE_R2_* env vars.');
    process.exit(1);
  }

  console.log('=== Syncing local files to Cloudflare R2 ===\n');

  // Sync book files
  const bookFiles = fs.readdirSync(BOOKS_DIR).filter(f => /\.(pdf|epub)$/i.test(f));
  console.log(`Found ${bookFiles.length} book files to sync.\n`);

  let bookSuccess = 0;
  let bookSkipped = 0;
  const CONCURRENT = 5;

  for (let i = 0; i < bookFiles.length; i += CONCURRENT) {
    const batch = bookFiles.slice(i, i + CONCURRENT);
    const promises = batch.map(async (file) => {
      const ext = path.extname(file).toLowerCase();
      const id = path.basename(file, ext);
      const key = `books/${id}${ext}`;
      const mime = ext === '.pdf' ? 'application/pdf' : 'application/epub+zip';
      const filePath = path.join(BOOKS_DIR, file);

      try {
        const url = await uploadToR2(filePath, key, mime);
        bookSuccess++;
        console.log(`  [${bookSuccess + bookSkipped}/${bookFiles.length}] ✅ ${file}`);
      } catch (err) {
        bookSkipped++;
        console.log(`  [${bookSuccess + bookSkipped}/${bookFiles.length}] ❌ ${file}: ${err.message}`);
      }
    });
    await Promise.all(promises);
  }

  console.log(`\nBooks: ${bookSuccess} uploaded, ${bookSkipped} failed.\n`);

  // Sync cover files
  let coverFiles = [];
  try {
    coverFiles = fs.readdirSync(COVERS_DIR).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  } catch { }
  
  console.log(`Found ${coverFiles.length} cover files to sync.\n`);

  let coverSuccess = 0;
  let coverSkipped = 0;

  for (let i = 0; i < coverFiles.length; i += CONCURRENT) {
    const batch = coverFiles.slice(i, i + CONCURRENT);
    const promises = batch.map(async (file) => {
      const ext = path.extname(file).toLowerCase();
      const id = path.basename(file, ext);
      const key = `covers/${id}${ext}`;
      const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
      const mime = mimeMap[ext] || 'image/jpeg';
      const filePath = path.join(COVERS_DIR, file);

      try {
        await uploadToR2(filePath, key, mime);
        coverSuccess++;
        console.log(`  [${coverSuccess + coverSkipped}/${coverFiles.length}] ✅ ${file}`);
      } catch (err) {
        coverSkipped++;
        console.log(`  [${coverSuccess + coverSkipped}/${coverFiles.length}] ❌ ${file}: ${err.message}`);
      }
    });
    await Promise.all(promises);
  }

  console.log(`\nCovers: ${coverSuccess} uploaded, ${coverSkipped} failed.`);
  console.log(`\n=== Sync complete ===`);
}

syncToR2().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
