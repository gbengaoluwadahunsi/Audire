import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadToR2, isR2Configured } from './r2Storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_BASE = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const BOOKS_DIR = path.join(UPLOAD_BASE, 'books');
const COVERS_DIR = path.join(UPLOAD_BASE, 'covers');

async function syncAll() {
  if (!isR2Configured()) {
    console.error('❌ Cloudflare R2 environment variables are missing in backend/.env!');
    console.log('Please set CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, and CLOUDFLARE_R2_SECRET_ACCESS_KEY.');
    process.exit(1);
  }

  console.log('🚀 Starting Cloudflare R2 Sync...');

  // 1. Sync Books
  const bookFiles = await fs.readdir(BOOKS_DIR).catch(() => []);
  console.log(`📚 Found ${bookFiles.length} book files in ${BOOKS_DIR}`);

  let uploadedBooks = 0;
  for (const file of bookFiles) {
    const ext = path.extname(file).toLowerCase();
    if (ext !== '.pdf' && ext !== '.epub') continue;
    const localPath = path.join(BOOKS_DIR, file);
    const key = `books/${file}`;
    const contentType = ext === '.pdf' ? 'application/pdf' : 'application/epub+zip';

    try {
      console.log(`[Uploading Book] ${file}...`);
      const url = await uploadToR2(localPath, key, contentType);
      console.log(`✅ Uploaded: ${url}`);
      uploadedBooks++;
    } catch (err) {
      console.error(`❌ Failed to upload ${file}:`, err.message);
    }
  }

  // 2. Sync Covers
  const coverFiles = await fs.readdir(COVERS_DIR).catch(() => []);
  console.log(`🖼️ Found ${coverFiles.length} cover files in ${COVERS_DIR}`);

  let uploadedCovers = 0;
  for (const file of coverFiles) {
    const ext = path.extname(file).toLowerCase();
    const localPath = path.join(COVERS_DIR, file);
    const key = `covers/${file}`;
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

    try {
      console.log(`[Uploading Cover] ${file}...`);
      const url = await uploadToR2(localPath, key, contentType);
      console.log(`✅ Uploaded: ${url}`);
      uploadedCovers++;
    } catch (err) {
      console.error(`❌ Failed to upload cover ${file}:`, err.message);
    }
  }

  console.log(`🎉 R2 Sync Complete! Successfully uploaded ${uploadedBooks} books and ${uploadedCovers} covers.`);
}

syncAll().catch((err) => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
