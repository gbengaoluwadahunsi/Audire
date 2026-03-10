import pg from 'pg';

const { Pool } = pg;

// Normalize sslmode to avoid pg deprecation warning (prefer/require → verify-full)
let connStr = process.env.DATABASE_URL || '';
if (connStr && /[?&]sslmode=(?:prefer|require|verify-ca)(?=&|$)/.test(connStr)) {
  connStr = connStr.replace(/sslmode=(?:prefer|require|verify-ca)/, 'sslmode=verify-full');
}

const pool = new Pool({
  connectionString: connStr || process.env.DATABASE_URL,
  ssl: connStr?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

export async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export { pool };
