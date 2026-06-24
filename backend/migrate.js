import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { query } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  try {
    const sqlPath = path.join(__dirname, 'neon-schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Running migration...');
    // Simply split by ';' could be dangerous if there are semicolons in strings, but schema is simple
    // Actually, we can just run the whole string if db.js allows multiple statements.
    // The pg driver allows multiple statements in a single query if they are separated by ;
    await query(sql);

    console.log('Migration successful!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
