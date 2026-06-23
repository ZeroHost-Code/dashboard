import { query } from '../config/db.js';

export async function logActivity(userId, action, details = '', serverId = null) {
  try {
    await query(
      'INSERT INTO activity_log (user_id, action, details, server_id) VALUES (?, ?, ?, ?)',
      [userId, action, details, serverId]
    );
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
}

export async function getRecentActivity(userId, limit = 20) {
  const rows = await query(
    'SELECT * FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit]
  );
  return rows;
}
