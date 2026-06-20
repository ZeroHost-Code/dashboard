import mariadb from 'mariadb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  acquireTimeout: 10000,
  insertIdAsNumber: true,
});

export async function query(sql, params = []) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(sql, params);
      return rows;
    } catch (err) {
      lastErr = err;
      if (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.message?.includes('timeout')) {
        console.error(`DB query attempt ${attempt}/3 failed:`, err.message);
        if (attempt < 3) await new Promise(r => setTimeout(r, 100 * attempt));
        continue;
      }
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }
  throw lastErr;
}

export async function getConnection() {
  return await pool.getConnection();
}

export default pool;
