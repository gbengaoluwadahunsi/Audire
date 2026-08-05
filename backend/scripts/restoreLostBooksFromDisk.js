/**
 * restoreLostBooksFromDisk.js — find local copies of books whose bytes were lost and
 * put them back into their existing library rows.
 *
 * Books are matched by sha256 against the file_hash recorded at upload time, so a
 * match is the exact same file — no guessing from titles, and no risk of pairing the
 * wrong edition. Matching is content-based, so filenames are irrelevant.
 *
 * Restoring keeps the row, and therefore reading progress, bookmarks and collections.
 *
 * Usage:
 *   node scripts/restoreLostBooksFromDisk.js <dir> [<dir> ...]           # dry run
 *   node scripts/restoreLostBooksFromDisk.js <dir> [<dir> ...] --apply   # restore
 */
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { query } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const dirs = args.filter((a) => a !== '--apply');

if (!dirs.length) {
  console.error('Usage: node scripts/restoreLostBooksFromDisk.js <dir> [<dir> ...] [--apply]');
  process.exit(1);
}

const { rows: lost } = await query(
  `SELECT id, title, author, format, file_hash FROM books
   WHERE file_url NOT LIKE '%r2.dev%' AND file_hash IS NOT NULL`
);
if (!lost.length) {
  console.log('No books are missing their file — nothing to restore.');
  process.exit(0);
}

const wanted = new Map(lost.map((b) => [b.file_hash, b]));
console.log(`Looking for local copies of ${wanted.size} lost books\n`);

async function* walk(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      yield* walk(full);
    } else if (/\.(pdf|epub)$/i.test(e.name)) {
      yield full;
    }
  }
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('data', (c) => h.update(c));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

const found = new Map(); // bookId -> local path
let scanned = 0;

for (const dir of dirs) {
  for await (const file of walk(dir)) {
    scanned++;
    let digest;
    try {
      digest = await sha256(file);
    } catch {
      continue;
    }
    const hit = wanted.get(digest);
    if (hit && !found.has(hit.id)) {
      found.set(hit.id, file);
      const name = hit.title && hit.title !== hit.id ? hit.title : '(untitled)';
      console.log(`  FOUND  ${name}`);
      console.log(`         ${file}`);
    }
  }
}

console.log(`\nScanned ${scanned} files. Matched ${found.size} of ${wanted.size} lost books.`);

const missing = lost.filter((b) => !found.has(b.id));
if (missing.length) {
  console.log(`\nStill missing (no local copy found):`);
  for (const b of missing) {
    console.log(`  ${b.title && b.title !== b.id ? b.title : b.id}  [${b.format}]`);
  }
}

if (!found.size) process.exit(0);

if (!APPLY) {
  console.log(`\nDry run — re-run with --apply to restore the ${found.size} matched books.`);
  process.exit(0);
}

// Delegate the actual restore so title/author re-extraction stays in one place.
console.log('');
let ok = 0;
let failed = 0;
for (const [bookId, file] of found) {
  const r = spawnSync(
    process.execPath,
    [path.join(__dirname, 'restoreBookFile.js'), bookId, file],
    { stdio: 'inherit', cwd: path.join(__dirname, '..') }
  );
  if (r.status === 0) ok++;
  else failed++;
}
console.log(`\nRestored ${ok}, failed ${failed}.`);
process.exit(0);
