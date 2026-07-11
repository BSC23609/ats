import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// Postgres returns NUMERIC as string by default; we want numbers in JSON.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

// Neon, Supabase, RDS and friends all require TLS. Their certificates are signed by a CA the
// container may not carry, so verification is relaxed — the connection is still encrypted.
const needsSsl = /neon\.tech|supabase|render\.com|amazonaws|sslmode=require/.test(process.env.DATABASE_URL || '');

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX || 10),
});

export const q = (text, params) => pool.query(text, params);

export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
