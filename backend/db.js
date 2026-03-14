import pg from 'pg';

const { Pool } = pg;

// Normalize sslmode to avoid pg deprecation warning (prefer/require → verify-full)
let connStr = process.env.DATABASE_URL || '';
if (connStr && /[?&]sslmode=(?:prefer|require|verify-ca)(?=&|$)/.test(connStr)) {
  connStr = connStr.replace(/sslmode=(?:prefer|require|verify-ca)/, 'sslmode=verify-full');
}

const isNeon = connStr?.includes('neon.tech');

const pool = new Pool({
  connectionString: connStr || process.env.DATABASE_URL,
  ssl: isNeon ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
});

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err.message);
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
