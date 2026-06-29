import { Router } from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { getAllServers, getServerById, suspendPteroServer, unsuspendPteroServer, deletePteroServer, deletePteroUser } from '../services/pyrodactyl.js';
import { verifyCap } from '../config/cap.js';
import { logActivity } from '../services/activity.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
const PTERO_URL = process.env.PTERO_URL;

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

router.post('/login', async (req, res) => {
  try {
    const { email, password, capToken } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!await verifyCap(capToken)) {
      return res.status(400).json({ error: 'Please complete the security check' });
    }

    const users = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    if (!user.is_admin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const valid = await argon2.verify(user.password_hash, password, { type: argon2.argon2id });
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username, pteroId: user.ptero_user_id, isAdmin: true },
      JWT_SECRET,
      { expiresIn: '2h', algorithm: 'HS256' }
    );

    res.json({ token, user: { id: user.id, email: user.email, username: user.username } });
  } catch (err) {
    console.error('Admin login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/check', authenticateToken, requireAdmin, (req, res) => {
  res.json({ admin: true, user: req.user });
});

router.get('/servers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const allServers = await getAllServers();
    const users = await query('SELECT id, email, username, ptero_user_id FROM users');
    const userMap = {};
    for (const u of users) {
      userMap[u.ptero_user_id] = { id: u.id, email: u.email, username: u.username };
    }

    for (const s of allServers) {
      s.owner = userMap[s.user] || { id: null, email: 'Unknown', username: 'Unknown' };
      try {
        const meta = await query('SELECT * FROM server_meta WHERE ptero_server_id = ?', [s.id]);
        s.serverMeta = meta.length > 0 ? meta[0] : null;
      } catch {
        s.serverMeta = null;
      }
    }

    res.json({ servers: allServers });
  } catch (err) {
    console.error('Admin servers list error:', err.message);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

router.get('/servers/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    if (isNaN(serverId)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }

    const server = await getServerById(serverId);
    const users = await query('SELECT id, email, username, ptero_user_id FROM users');
    const owner = users.find(u => u.ptero_user_id === server.user);
    server.owner = owner ? { id: owner.id, email: owner.email, username: owner.username } : { id: null, email: 'Unknown', username: 'Unknown' };

    try {
      const meta = await query('SELECT * FROM server_meta WHERE ptero_server_id = ?', [serverId]);
      server.serverMeta = meta.length > 0 ? meta[0] : null;
    } catch {
      server.serverMeta = null;
    }

    res.json({ server });
  } catch (err) {
    console.error('Admin server detail error:', err.message);
    res.status(500).json({ error: 'Failed to fetch server details' });
  }
});

router.post('/servers/:id/suspend', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    if (isNaN(serverId)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }

    const reason = req.body.reason || 'Suspended by an Administrator. Please contact support.';
    await suspendPteroServer(serverId);
    await query('UPDATE server_meta SET status = ?, suspend_reason = ?, suspended_by = ? WHERE ptero_server_id = ?', ['suspended', reason, 'admin', serverId]);

    await logActivity(req.user.userId, 'admin_suspend', `Admin suspended server #${serverId}${reason ? ': ' + reason : ''}`, serverId);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin suspend error:', err.message);
    res.status(500).json({ error: 'Failed to suspend server: ' + err.message });
  }
});

router.post('/servers/:id/unsuspend', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    if (isNaN(serverId)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }

    await unsuspendPteroServer(serverId);
    await query('UPDATE server_meta SET status = ?, suspend_reason = NULL, suspended_by = NULL WHERE ptero_server_id = ?', ['active', serverId]);
    await logActivity(req.user.userId, 'admin_unsuspend', `Admin unsuspended server #${serverId}`, serverId);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin unsuspend error:', err.message);
    res.status(500).json({ error: 'Failed to unsuspend server: ' + err.message });
  }
});

router.post('/servers/:id/stop', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    if (isNaN(serverId)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }

    const server = await getServerById(serverId);
    const meta = await query('SELECT user_id FROM server_meta WHERE ptero_server_id = ?', [serverId]);
    if (meta.length === 0) {
      return res.status(404).json({ error: 'Server meta not found' });
    }

    const users = await query('SELECT ptero_client_api_key FROM users WHERE id = ?', [meta[0].user_id]);
    if (!users[0]?.ptero_client_api_key) {
      return res.status(400).json({ error: 'Server owner has no Pyrodactyl API key configured' });
    }

    const pteroRes = await fetch(`${PTERO_URL}/api/client/servers/${server.identifier}/power`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${users[0].ptero_client_api_key}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ signal: 'stop' }),
      signal: AbortSignal.timeout(10000),
    });

    if (!pteroRes.ok) {
      return res.status(502).json({ error: 'Failed to send stop command to panel' });
    }

    await logActivity(req.user.userId, 'admin_stop', `Admin stopped server #${serverId}`, serverId);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin stop error:', err.message);
    res.status(500).json({ error: 'Failed to stop server: ' + err.message });
  }
});

router.post('/servers/:id/renew-now', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    if (isNaN(serverId)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }

    await suspendPteroServer(serverId);
    await query(
      'UPDATE server_meta SET expires_at = DATE_SUB(NOW(), INTERVAL 1 DAY), status = ?, suspend_reason = NULL, suspended_by = NULL WHERE ptero_server_id = ?',
      ['suspended', serverId]
    );

    await logActivity(req.user.userId, 'admin_renew_now', `Admin force-expired server #${serverId}`, serverId);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin renew-now error:', err.message);
    res.status(500).json({ error: 'Failed to expire server: ' + err.message });
  }
});

router.delete('/servers/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    if (isNaN(serverId)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }

    const meta = await query('SELECT status FROM server_meta WHERE ptero_server_id = ?', [serverId]);
    if (meta.length > 0 && meta[0].status === 'suspended') {
      return res.status(403).json({ error: 'Cannot delete a suspended server' });
    }
    try {
      await deletePteroServer(serverId);
    } catch (err) {
      console.warn('Pterodactyl delete failed (proceeding with local cleanup):', err.message);
    }
    await query('DELETE FROM server_meta WHERE ptero_server_id = ?', [serverId]);
    await logActivity(req.user.userId, 'admin_delete', `Admin deleted server #${serverId}`, serverId);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete server: ' + err.message });
  }
});

// ─── Users ──────────────────────────────────────────────
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let rows = await query(`
      SELECT u.id, u.email, u.username, u.is_admin, u.created_at,
        CAST((SELECT COUNT(*) FROM server_meta WHERE user_id = u.id) AS SIGNED) as server_count
      FROM users u
      ORDER BY u.created_at DESC
    `);
    // Convert any BigInt values to Number for JSON serialization
    rows = rows.map(r => ({ ...r, id: Number(r.id), server_count: Number(r.server_count) }));
    res.json({ users: rows });
  } catch (err) {
    console.error('Admin users list error:', err.message);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const users = await query(
      'SELECT id, email, username, is_admin, ptero_user_id, ptero_client_api_key, created_at FROM users WHERE id = ?',
      [userId]
    );
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    let user = users[0];
    for (const k of Object.keys(user)) {
      if (typeof user[k] === 'bigint') user[k] = Number(user[k]);
    }

    let servers = await query(
      "SELECT * FROM server_meta WHERE user_id = ? AND status IN ('active', 'suspended') ORDER BY created_at DESC",
      [userId]
    );
    for (const s of servers) {
      for (const k of Object.keys(s)) {
        if (typeof s[k] === 'bigint') s[k] = Number(s[k]);
      }
    }

    const ips = await query(
      'SELECT ip_address, created_at FROM user_ips WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    res.json({ user, servers, ips });
  } catch (err) {
    console.error('Admin user detail error:', err.message);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

router.post('/users/:id/toggle-admin', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot change your own admin status' });
    }

    const users = await query('SELECT is_admin FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newStatus = users[0].is_admin ? 0 : 1;
    await query('UPDATE users SET is_admin = ? WHERE id = ?', [newStatus, userId]);

    await logActivity(req.user.userId, 'admin_toggle_admin', `Toggled admin for user #${userId} to ${newStatus ? 'admin' : 'user'}`);
    res.json({ success: true, is_admin: !!newStatus });
  } catch (err) {
    console.error('Admin toggle-admin error:', err.message);
    res.status(500).json({ error: 'Failed to toggle admin status' });
  }
});

router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const users = await query('SELECT ptero_user_id FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const pteroUserId = users[0].ptero_user_id;

    // Delete servers in panel first
    const servers = await query('SELECT ptero_server_id FROM server_meta WHERE user_id = ?', [userId]);
    for (const s of servers) {
      try {
        await deletePteroServer(s.ptero_server_id);
      } catch { /* panel may already have deleted it */ }
    }

    // Delete user in panel
    if (pteroUserId) {
      try {
        await deletePteroUser(pteroUserId);
      } catch { /* may already be deleted */ }
    }

    // Delete from local DB (cascades to user_ips, activity_log, server_meta)
    await query('DELETE FROM users WHERE id = ?', [userId]);

    await logActivity(req.user.userId, 'admin_delete_user', `Deleted user #${userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin delete user error:', err.message);
    res.status(500).json({ error: 'Failed to delete user: ' + err.message });
  }
});

// ─── Stats ──────────────────────────────────────────────
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [userCount] = await query('SELECT COUNT(*) as count FROM users');
    const [serverMetaCount] = await query('SELECT COUNT(*) as count FROM server_meta');
    const [activeCount] = await query("SELECT COUNT(*) as count FROM server_meta WHERE status = 'active'");
    const [suspendedCount] = await query("SELECT COUNT(*) as count FROM server_meta WHERE status = 'suspended'");
    const [recentUsers] = await query('SELECT COUNT(*) as count FROM users WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)');
    const [expiredCount] = await query("SELECT COUNT(*) as count FROM server_meta WHERE status = 'expired'");

    res.json({
      stats: {
        total_users: Number(userCount.count),
        total_servers: Number(serverMetaCount.count),
        active_servers: Number(activeCount.count),
        suspended_servers: Number(suspendedCount.count),
        expired_servers: Number(expiredCount.count),
        new_users_24h: Number(recentUsers.count),
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── Activity Log ───────────────────────────────────────
router.get('/activity', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const rows = await query(`
      SELECT al.*, u.username 
      FROM activity_log al 
      LEFT JOIN users u ON al.user_id = u.id 
      ORDER BY al.created_at DESC 
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const [totalRow] = await query('SELECT COUNT(*) as count FROM activity_log');

    res.json({ activities: rows, total: Number(totalRow.count) });
  } catch (err) {
    console.error('Admin activity error:', err.message);
    res.status(500).json({ error: 'Failed to fetch activity log' });
  }
});

export default router;
