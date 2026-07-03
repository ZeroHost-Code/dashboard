import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead } from '../services/notification.js';

const router = Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 50, 100));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const result = await getNotifications(req.user.userId, limit, offset);
    res.json({
      notifications: result.notifications,
      total: result.total,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(result.total / limit) || 1,
      limit,
    });
  } catch (err) {
    console.error('Notifications route error:', err.message);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const count = await getUnreadCount(req.user.userId);
    res.json({ count });
  } catch (err) {
    console.error('Unread count error:', err.message);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid notification ID' });
    await markAsRead(id, req.user.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err.message);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.patch('/read-all', authenticateToken, async (req, res) => {
  try {
    await markAllAsRead(req.user.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark all read error:', err.message);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

export default router;
