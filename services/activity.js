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

export async function getRecentActivity(userId, limit = 20, offset = 0) {
  const rows = await query(
    `SELECT *, (SELECT COUNT(*) FROM activity_log WHERE user_id = ? AND action NOT LIKE 'admin_%') as _total FROM activity_log WHERE user_id = ? AND action NOT LIKE 'admin_%' ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, userId, parseInt(limit, 10), parseInt(offset, 10)]
  );
  const total = rows.length > 0 ? Number(rows[0]._total) : 0;
  rows.forEach(r => delete r._total);
  return { activities: rows, total };
}
