import { query } from '../config/db.js';

export async function createNotification(userId, title, message, type = 'info', link = null) {
  try {
    await query(
      'INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)',
      [userId, title, message, type, link]
    );
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
}

export async function getNotifications(userId, limit = 20, offset = 0) {
  const rows = await query(
    `SELECT *, (SELECT COUNT(*) FROM notifications WHERE user_id = ?) as _total FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, userId, parseInt(limit, 10), parseInt(offset, 10)]
  );
  const total = rows.length > 0 ? Number(rows[0]._total) : 0;
  rows.forEach(r => delete r._total);
  return { notifications: rows, total };
}

export async function getUnreadCount(userId) {
  const rows = await query(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
    [userId]
  );
  return Number(rows[0]?.count || 0);
}

export async function markAsRead(notificationId, userId) {
  await query(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [notificationId, userId]
  );
}

export async function markAllAsRead(userId) {
  await query(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
    [userId]
  );
}
