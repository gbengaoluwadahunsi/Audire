/**
 * fixR2Urls.js
 * One-shot repair script to update DB file_url and cover columns for books
 * that still point to Render API endpoints but whose files exist in R2.
 *
 * Run: node backend/fixR2Urls.js
 */

import 'dotenv/config';
import { query } from '../db.js';
import { isR2Configured } from '../r2Storage.js';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

const R2_PUBLIC_BASE = (process.env.CLOUDFLARE_R2_PUBLIC_URL || 'https://pub-71d570ca196945939ec117bf558c4c0d.r2.dev').replace(/\/$/, '');
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
  console.log('🔍 Checking R2 configuration...');
  if (!isR2Configured()) {
    console.error('❌ R2 credentials not configured. Set CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY in .env');
    process.exit(1);
  }
  console.log('✅ R2 configured');

  console.log('\n📚 Fetching all books from DB...');
  const { rows: books } = await query('SELECT id, format, file_url, cover FROM books ORDER BY added_at DESC');
  console.log(`Found ${books.length} books\n`);

  let fileFixed = 0;
  let coverFixed = 0;
  let fileNotInR2 = 0;
  let coverNotInR2 = 0;

  for (const book of books) {
    const needsFileUpdate = !book.file_url || !/r2\.dev|r2\.cloudflarestorage\.com/i.test(book.file_url);
    const needsCoverUpdate = !book.cover || !/r2\.dev|r2\.cloudflarestorage\.com/i.test(book.cover);

    if (!needsFileUpdate && !needsCoverUpdate) continue;

    const fmt = book.format || 'pdf';
    let newFileUrl = null;
    let newCoverUrl = null;

    if (needsFileUpdate) {
      const key = `books/${book.id}.${fmt}`;
      const exists = await existsInR2(key);
      if (exists) {
        newFileUrl = `${R2_PUBLIC_BASE}/${key}`;
        fileFixed++;
        console.log(`  ✅ File in R2: ${book.id} → ${newFileUrl}`);
      } else {
        // Try the other format
        const altFmt = fmt === 'pdf' ? 'epub' : 'pdf';
        const altKey = `books/${book.id}.${altFmt}`;
        const altExists = await existsInR2(altKey);
        if (altExists) {
          newFileUrl = `${R2_PUBLIC_BASE}/${altKey}`;
          fileFixed++;
          console.log(`  ✅ File in R2 (alt fmt): ${book.id} → ${newFileUrl}`);
        } else {
          fileNotInR2++;
          console.log(`  ⚠️  File NOT in R2: ${book.id} — user must re-upload`);
        }
      }
    }

    if (needsCoverUpdate) {
      // Try .png first (most common), then .jpg
      for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
        const key = `covers/${book.id}.${ext}`;
        const exists = await existsInR2(key);
        if (exists) {
          newCoverUrl = `${R2_PUBLIC_BASE}/${key}`;
          coverFixed++;
          console.log(`  ✅ Cover in R2: ${book.id} → ${newCoverUrl}`);
          break;
        }
      }
      if (!newCoverUrl) {
        coverNotInR2++;
        // Leave as-is (null cover is fine — frontend shows placeholder)
      }
    }

    if (newFileUrl || newCoverUrl) {
      await query(
        'UPDATE books SET file_url = COALESCE($2, file_url), cover = COALESCE($3, cover) WHERE id = $1',
        [book.id, newFileUrl, newCoverUrl]
      );
    }
  }

  console.log('\n📊 Summary:');
  console.log(`  Files updated to R2:     ${fileFixed}`);
  console.log(`  Files missing from R2:   ${fileNotInR2}  ← these books need to be re-uploaded`);
  console.log(`  Covers updated to R2:    ${coverFixed}`);
  console.log(`  Covers missing from R2:  ${coverNotInR2}`);
  console.log('\n✅ Done!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
