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
  ssl: isNeon ? { rejectUnauthorized: false } : (connStr?.includes('sslmode=') ? { rejectUnauthorized: false } : false),
  max: 10,
  idleTimeoutMillis: 10_000,      // Close idle connections faster to avoid holding 'dead' ones
  connectionTimeoutMillis: 15_000, // Wait up to 15s for Neon to wake up
  keepAlive: true,
});

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err.message);
});

/**
 * Executes a SQL query with automatic single-retry for safe (read-only or connection-related) errors.
 * Useful for handling Neon cold starts/preemptions on the free tier.
 */
export async function query(text, params, retry = true) {
  if (!connStr) {
    throw new Error('DATABASE_URL is not configured');
  }
  try {
    const { rows, fields } = await pool.query(text, params);
    return { rows, fields };
  } catch (err) {
    const message = err.message || '';
    const isConnErr = message.includes('terminated') || message.includes('timeout') || message.includes('ECONNRESET');

    if (retry && isConnErr) {
      console.warn('[DB] Connection dropped, retrying query once...', message);
      // Wait a tiny bit for the pool to reset
      await new Promise(r => setTimeout(r, 500));
      return query(text, params, false);
    }
    throw err;
  }
}

export { pool };
