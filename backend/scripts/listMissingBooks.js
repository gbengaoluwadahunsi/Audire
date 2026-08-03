/**
 * listMissingBooks.js — list titles of books whose files are missing from R2
 * Run: node backend/listMissingBooks.js
 */

import 'dotenv/config';
import { query } from '../db.js';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

const R2_PUBLIC_BASE = (process.env.CLOUDFLARE_R2_PUBLIC_URL || '').replace(/\/$/, '');
const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';
const bucketName = process.env.CLOUDFLARE_R2_BUCKET || 'audire-books';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

async function existsInR2(key) {
  try {
    await r2Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { rows: books } = await query('SELECT id, title, author, format, file_url, added_at FROM books ORDER BY added_at DESC');

  const missing = [];
  for (const book of books) {
    const fmt = book.format || 'pdf';
    const key = `books/${book.id}.${fmt}`;
    const altKey = `books/${book.id}.${fmt === 'pdf' ? 'epub' : 'pdf'}`;
    const exists = await existsInR2(key) || await existsInR2(altKey);
    if (!exists) missing.push(book);
  }

  console.log(`\n📚 ${missing.length} books missing from R2 (need re-upload):\n`);
  for (const b of missing) {
    console.log(`  • "${b.title}" by ${b.author || 'Unknown'} — ID: ${b.id}`);
  }
  console.log('\n✅ Done!');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
