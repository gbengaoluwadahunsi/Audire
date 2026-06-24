import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureSchema() {
  const sqlPath = path.join(__dirname, 'neon-schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await query(sql);
}

async function runMigration() {
  try {
    console.log('Running migration...');
    await ensureSchema();
    console.log('Migration successful!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  runMigration();
}
