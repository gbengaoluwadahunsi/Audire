/**
 * findRecoverableBooks.js — read-only. sha256 every orphan R2 object and match it against the
 * file_hash of books whose bytes were lost. A hit means the file is already in R2
 * under an old id and the row can simply be repointed.
 */
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import { query } from '../db.js';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
const bucketName = process.env.CLOUDFLARE_R2_BUCKET || 'audire-books';
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '',
  },
});

const objs = []; let token;
do {
  const r = await r2.send(new ListObjectsV2Command({ Bucket: bucketName, Prefix: 'books/', ContinuationToken: token }));
  for (const c of r.Contents || []) objs.push({ key: c.Key, size: c.Size });
  token = r.IsTruncated ? r.NextContinuationToken : undefined;
} while (token);

const { rows: all } = await query('SELECT id FROM books');
const dbIds = new Set(all.map(r => r.id));
const idOf = k => k.replace(/^books\//, '').replace(/\.(pdf|epub)$/i, '');
const orphans = objs.filter(o => !dbIds.has(idOf(o.key)));

const { rows: broken } = await query(
  `SELECT id, title, format, file_hash FROM books WHERE file_url NOT LIKE '%r2.dev%'`
);
const wanted = new Map(broken.map(b => [b.file_hash, b]));
console.log(`Hashing ${orphans.length} orphan objects against ${wanted.size} lost-book hashes...\n`);

const hits = [];
let done = 0;
for (const o of orphans) {
  const res = await r2.send(new GetObjectCommand({ Bucket: bucketName, Key: o.key }));
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    res.Body.on('data', c => hash.update(c));
    res.Body.on('end', resolve);
    res.Body.on('error', reject);
  });
  const digest = hash.digest('hex');
  done++;
  const hit = wanted.get(digest);
  if (hit) {
    hits.push({ lostId: hit.id, lostTitle: hit.title, orphanKey: o.key, sizeMB: (o.size / 1048576).toFixed(1) });
    console.log(`  HIT ${done}/${orphans.length}  ${o.key}  ->  ${hit.id}  "${(hit.title || '').slice(0, 45)}"`);
  } else if (done % 10 === 0) {
    console.log(`  ...${done}/${orphans.length} scanned, ${hits.length} hits`);
  }
}

console.log(`\n=== ${hits.length} of ${broken.length} lost books recoverable from existing R2 objects ===`);
for (const h of hits) console.log(`  ${h.lostId}  <-  ${h.orphanKey}  (${h.sizeMB}MB)  "${(h.lostTitle || '').slice(0, 45)}"`);
fs.writeFileSync(new URL('./recoverable-books.json', import.meta.url), JSON.stringify(hits, null, 2));
console.log(`\nWrote ${hits.length} matches to backend/scripts/recoverable-books.json`);
process.exit(0);
