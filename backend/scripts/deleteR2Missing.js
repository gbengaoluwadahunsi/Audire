/**
 * deleteR2Missing.js — delete DB records for books missing from R2
 * Run: node backend/deleteR2Missing.js
 */

import 'dotenv/config';
import { query } from '../db.js';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

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
  const { rows: books } = await query('SELECT id, title, author, format FROM books ORDER BY added_at DESC');
  console.log(`\n📚 Checking ${books.length} books...\n`);

  const toDelete = [];
  for (const book of books) {
    const fmt = book.format || 'pdf';
    const key = `books/${book.id}.${fmt}`;
    const altKey = `books/${book.id}.${fmt === 'pdf' ? 'epub' : 'pdf'}`;
    const exists = await existsInR2(key) || await existsInR2(altKey);
    if (!exists) toDelete.push(book);
  }

  if (toDelete.length === 0) {
    console.log('✅ No missing books found — nothing to delete!');
    process.exit(0);
  }

  console.log(`🗑️  Deleting ${toDelete.length} books missing from R2:\n`);
  for (const b of toDelete) {
    console.log(`  Deleting: "${b.title}" (${b.id})`);
    // Remove from books table (cascade will clean up collection memberships)
    await query('DELETE FROM books WHERE id = $1', [b.id]);
  }

  console.log(`\n✅ Deleted ${toDelete.length} unrecoverable books from DB.`);
  console.log('   Please re-upload these books through the app.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
