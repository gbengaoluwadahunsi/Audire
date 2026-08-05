/**
 * repointRecoveredBooks.js — restore books whose bytes were lost but whose exact file
 * is still in R2 under an older, orphaned id (matched by sha256 file_hash).
 *
 * The library row is kept, so reading progress, bookmarks and collections survive —
 * only the storage location changes. The orphan object is copied server-side inside
 * R2 (no download) to the key the row expects, then file_url is repointed.
 *
 * Usage:
 *   node scripts/repointRecoveredBooks.js            # dry run, prints the plan
 *   node scripts/repointRecoveredBooks.js --apply    # perform the copy + DB update
 */
import 'dotenv/config';
import fs from 'fs';
import { query } from '../db.js';
import { S3Client, CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const APPLY = process.argv.includes('--apply');

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
const bucketName = process.env.CLOUDFLARE_R2_BUCKET || 'audire-books';
const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL || '').replace(/\/$/, '');
if (!publicBase) {
  console.error('CLOUDFLARE_R2_PUBLIC_URL is not set — cannot build the new file_url');
  process.exit(1);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '',
  },
});

const resultPath = new URL('./recoverable-books.json', import.meta.url);
if (!fs.existsSync(resultPath)) {
  console.error('No recoverable-books.json — run the hash match scan first.');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(resultPath, 'utf8'));

// The same book can have been uploaded twice, leaving two byte-identical orphans that
// both match one lost row. Restoring either is equivalent, so keep the first.
const hits = [];
const claimed = new Set();
for (const h of raw) {
  if (claimed.has(h.lostId)) continue;
  claimed.add(h.lostId);
  hits.push(h);
}

console.log(`${hits.length} recoverable books${APPLY ? '' : '  (dry run — pass --apply to perform)'}\n`);

let ok = 0;
let failed = 0;

for (const h of hits) {
  const ext = h.orphanKey.replace(/^.*\./, '').toLowerCase();
  const destKey = `books/${h.lostId}.${ext}`;
  const newUrl = `${publicBase}/${destKey}`;
  const label = `${h.lostId}  <- ${h.orphanKey}  (${h.sizeMB}MB)`;

  if (!APPLY) {
    console.log(`  would copy  ${label}`);
    console.log(`         and  set file_url = ${newUrl}`);
    continue;
  }

  try {
    await r2.send(new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: `/${bucketName}/${h.orphanKey}`,
      Key: destKey,
      ContentType: ext === 'pdf' ? 'application/pdf' : 'application/epub+zip',
      MetadataDirective: 'REPLACE',
    }));
    await r2.send(new HeadObjectCommand({ Bucket: bucketName, Key: destKey }));

    // format must agree with the key, otherwise the /:id/file fallback rebuilds the
    // wrong extension and 404s again.
    await query('UPDATE books SET file_url = $2, format = $3 WHERE id = $1', [h.lostId, newUrl, ext]);
    console.log(`  restored  ${label}`);
    ok++;
  } catch (err) {
    console.error(`  FAILED    ${label}\n            ${err.message}`);
    failed++;
  }
}

if (APPLY) console.log(`\nRestored ${ok}, failed ${failed}.`);
process.exit(0);
