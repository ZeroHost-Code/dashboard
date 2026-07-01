import mariadb from 'mariadb';

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  connectTimeout: 5000,
  acquireTimeout: 10000,
  idleTimeout: 30000,
  insertIdAsNumber: true,
  pingTimeout: 5000,
});

export async function closePool() {
  try {
    await pool.end();
  } catch (err) {
    console.error('Error closing pool:', err.message);
  }
}

export async function getPoolStatus() {
  try {
    const active = pool.activeConnections();
    const total = pool.totalConnections();
    const idle = pool.idleConnections();
    return { active, total, idle };
  } catch {
    return { active: -1, total: -1, idle: -1 };
  }
}

export async function query(sql, params = []) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let conn;
    let queryTimeout;
    try {
      conn = await pool.getConnection();
      const timeoutPromise = new Promise((_, reject) => {
        queryTimeout = setTimeout(() => reject(new Error('Query timeout after 30000ms')), 30000);
      });
      const rows = await Promise.race([
        conn.query(sql, params),
        timeoutPromise,
      ]);
      clearTimeout(queryTimeout);
      return rows;
    } catch (err) {
      lastErr = err;
      if (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.message?.includes('timeout')) {
        console.error(`DB query attempt ${attempt}/3 failed:`, err.message);
        if (attempt < 3) await new Promise(r => setTimeout(r, 100 * attempt));
        continue;
      }
      clearTimeout(queryTimeout);
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }
  throw lastErr;
}


