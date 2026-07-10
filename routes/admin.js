import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { getAllServers, getServerById, getEgg, getPteroNests, getPteroNestEggs, suspendPteroServer, unsuspendPteroServer, deletePteroServer, deletePteroUser, updatePteroServerBuild, getPergoServerIdsByEgg, getAllNodes, getNodeDetail, getNodeAllocations, getNodeServers, PANEL_DB_NAME } from '../services/pyrodactyl.js';
import { verifyCap } from '../config/cap.js';
import { logActivity } from '../services/activity.js';
import { createNotification } from '../services/notification.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
const PTERO_URL = process.env.PTERO_URL;

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many admin login attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', adminLoginLimiter, async (req, res) => {
  try {
    const { email, password, capToken } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input types' });
    }

    if (!await verifyCap(capToken)) {
      return res.status(400).json({ error: 'Please complete the security check' });
    }

    const users = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    if (user.auth_restricted) {
      return res.status(403).json({ error: 'Your account has been restricted. Contact support for assistance.' });
    }
    if (!user.is_admin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const valid = await argon2.verify(user.password_hash, password, { type: argon2.argon2id });
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username, pteroId: user.ptero_user_id, isAdmin: true, restricted: false, tokenVersion: user.token_version },
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

    const reason = (req.body.reason && typeof req.body.reason === 'string')
      ? req.body.reason.slice(0, 500) : 'Suspended by an Administrator. Please contact support.';
    await suspendPteroServer(serverId);
    await query('UPDATE server_meta SET status = ?, suspend_reason = ?, suspended_by = ? WHERE ptero_server_id = ?', ['suspended', reason, 'admin', serverId]);

    await logActivity(req.user.userId, 'admin_suspend', `Admin suspended server #${serverId}${reason ? ': ' + reason : ''}`, serverId);
    const sMeta = await query('SELECT user_id FROM server_meta WHERE ptero_server_id = ?', [serverId]);
    if (sMeta.length > 0) {
      await createNotification(sMeta[0].user_id, 'Server Suspended', `Your server #${serverId} has been suspended by an administrator.`, 'error', `/server/${serverId}`);
    }
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
    const usMeta = await query('SELECT user_id FROM server_meta WHERE ptero_server_id = ?', [serverId]);
    if (usMeta.length > 0) {
      await createNotification(usMeta[0].user_id, 'Server Unsuspended', `Your server #${serverId} has been unsuspended by an administrator.`, 'success', `/server/${serverId}`);
    }
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

// ─── Nodes ──────────────────────────────────────────────
router.get('/nodes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const nodes = await getAllNodes();
    res.json({ nodes });
  } catch (err) {
    console.error('Admin nodes list error:', err.message);
    res.status(500).json({ error: 'Failed to fetch nodes' });
  }
});

router.get('/nodes/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const nodeId = parseInt(req.params.id, 10);
    if (isNaN(nodeId)) {
      return res.status(400).json({ error: 'Invalid node ID' });
    }

    const node = await getNodeDetail(nodeId);
    res.json({ node });
  } catch (err) {
    console.error('Admin node detail error:', err.message);
    res.status(500).json({ error: 'Failed to fetch node details' });
  }
});

router.get('/nodes/:id/allocations', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const nodeId = parseInt(req.params.id, 10);
    if (isNaN(nodeId)) {
      return res.status(400).json({ error: 'Invalid node ID' });
    }

    const allocations = await getNodeAllocations(nodeId);
    res.json({ allocations });
  } catch (err) {
    console.error('Admin node allocations error:', err.message);
    res.status(500).json({ error: 'Failed to fetch node allocations' });
  }
});

router.get('/nodes/:id/servers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const nodeId = parseInt(req.params.id, 10);
    if (isNaN(nodeId)) {
      return res.status(400).json({ error: 'Invalid node ID' });
    }

    const servers = await getNodeServers(nodeId);
    res.json({ servers });
  } catch (err) {
    console.error('Admin node servers error:', err.message);
    res.status(500).json({ error: 'Failed to fetch node servers' });
  }
});

router.get('/nodes/:id/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const nodeId = parseInt(req.params.id, 10);
    if (isNaN(nodeId)) {
      return res.status(400).json({ error: 'Invalid node ID' });
    }

    const rows = await query('SELECT * FROM node_settings WHERE ptero_node_id = ?', [nodeId]);
    if (rows.length === 0) {
      return res.json({ settings: { ptero_node_id: nodeId, unavailable: false } });
    }
    res.json({ settings: rows[0] });
  } catch (err) {
    console.error('Admin node settings error:', err.message);
    res.status(500).json({ error: 'Failed to fetch node settings' });
  }
});

router.put('/nodes/:id/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const nodeId = parseInt(req.params.id, 10);
    if (isNaN(nodeId)) {
      return res.status(400).json({ error: 'Invalid node ID' });
    }

    const { unavailable } = req.body;
    if (typeof unavailable !== 'boolean') {
      return res.status(400).json({ error: 'unavailable must be a boolean' });
    }

    const existing = await query('SELECT id FROM node_settings WHERE ptero_node_id = ?', [nodeId]);
    if (existing.length === 0) {
      await query('INSERT INTO node_settings (ptero_node_id, unavailable) VALUES (?, ?)', [nodeId, unavailable ? 1 : 0]);
    } else {
      await query('UPDATE node_settings SET unavailable = ? WHERE ptero_node_id = ?', [unavailable ? 1 : 0, nodeId]);
    }

    await logActivity(req.user.userId, 'admin_node_settings', `${unavailable ? 'Disabled' : 'Enabled'} node #${nodeId}`);
    res.json({ success: true, unavailable });
  } catch (err) {
    console.error('Admin node settings update error:', err.message);
    res.status(500).json({ error: 'Failed to update node settings' });
  }
});

router.get('/nodes/unavailable', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await query('SELECT ptero_node_id FROM node_settings WHERE unavailable = 1');
    res.json({ nodeIds: rows.map(r => r.ptero_node_id) });
  } catch (err) {
    console.error('Admin unavailable nodes error:', err.message);
    res.status(500).json({ error: 'Failed to fetch unavailable nodes' });
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
      'SELECT id, email, username, is_admin, restricted, auth_restricted, ptero_user_id, ptero_client_api_key, created_at FROM users WHERE id = ?',
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
      `SELECT m.*, p.name AS server_name, p.uuid AS server_uuid
       FROM server_meta m
       LEFT JOIN ${PANEL_DB_NAME}.servers p ON m.ptero_server_id = p.id
       WHERE m.user_id = ?
       ORDER BY m.created_at DESC`,
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

router.post('/users/:id/toggle-restriction', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot restrict yourself' });
    }

    const users = await query('SELECT restricted FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newStatus = users[0].restricted ? 0 : 1;
    await query('UPDATE users SET restricted = ? WHERE id = ?', [newStatus, userId]);

    await logActivity(req.user.userId, 'admin_toggle_restriction', `${newStatus ? 'Restricted' : 'Unrestricted'} user #${userId}`);
    res.json({ success: true, restricted: !!newStatus });
  } catch (err) {
    console.error('Admin toggle-restriction error:', err.message);
    res.status(500).json({ error: 'Failed to toggle restriction status' });
  }
});

router.post('/users/:id/toggle-auth-restriction', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot restrict your own auth' });
    }

    const users = await query('SELECT auth_restricted FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newStatus = users[0].auth_restricted ? 0 : 1;
    if (newStatus) {
      await query('UPDATE users SET auth_restricted = 1, token_version = token_version + 1 WHERE id = ?', [userId]);
    } else {
      await query('UPDATE users SET auth_restricted = 0 WHERE id = ?', [userId]);
    }

    await logActivity(req.user.userId, 'admin_toggle_auth_restriction', `${newStatus ? 'Auth restricted' : 'Auth unrestricted'} user #${userId}`);
    res.json({ success: true, auth_restricted: !!newStatus });
  } catch (err) {
    console.error('Admin toggle-auth-restriction error:', err.message);
    res.status(500).json({ error: 'Failed to toggle auth restriction status' });
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

router.post('/users/:id/notify', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const { title, message, type } = req.body;
    if (typeof title !== 'string' || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid input types' });
    }
    if (!title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (title.trim().length > 255) {
      return res.status(400).json({ error: 'Title must be 255 characters or less' });
    }
    if (!message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.trim().length > 5000) {
      return res.status(400).json({ error: 'Message must be 5000 characters or less' });
    }

    const users = await query('SELECT id FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validTypes = ['info', 'success', 'warning', 'error'];
    const notifType = validTypes.includes(type) ? type : 'info';

    await createNotification(userId, title.trim(), message.trim(), notifType);
    await logActivity(req.user.userId, 'admin_notify', `Sent notification to user #${userId}: ${title.trim()}`, null);

    res.json({ success: true });
  } catch (err) {
    console.error('Admin notify error:', err.message);
    res.status(500).json({ error: 'Failed to send notification: ' + err.message });
  }
});

router.post('/notify-all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, message, type } = req.body;
    if (typeof title !== 'string' || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid input types' });
    }
    if (!title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (title.trim().length > 255) {
      return res.status(400).json({ error: 'Title must be 255 characters or less' });
    }
    if (!message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.trim().length > 5000) {
      return res.status(400).json({ error: 'Message must be 5000 characters or less' });
    }

    const validTypes = ['info', 'success', 'warning', 'error'];
    const notifType = validTypes.includes(type) ? type : 'info';

    const users = await query('SELECT id FROM users');
    if (users.length === 0) {
      return res.status(404).json({ error: 'No users found' });
    }

    for (const user of users) {
      await createNotification(user.id, title.trim(), message.trim(), notifType);
    }

    await logActivity(req.user.userId, 'admin_notify_all', `Sent notification to all ${users.length} user(s): ${title.trim()}`, null);

    res.json({ success: true, count: users.length });
  } catch (err) {
    console.error('Admin notify-all error:', err.message);
    res.status(500).json({ error: 'Failed to send notifications: ' + err.message });
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

// ─── Settings: Nests ────────────────────────────────────
router.get('/settings/nests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const nests = await query('SELECT * FROM nests ORDER BY name ASC');
    res.json({ nests });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch nests: ' + err.message });
  }
});

router.get('/settings/nests/available', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pteroNests = await getPteroNests();
    const localNests = await query('SELECT ptero_nest_id FROM nests');
    const localIds = new Set(localNests.map(n => n.ptero_nest_id));
    const available = pteroNests.filter(n => !localIds.has(n.id));
    res.json({ nests: available });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch available nests: ' + err.message });
  }
});

router.post('/settings/nests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { pteroNestId, name } = req.body;
    if (!pteroNestId) return res.status(400).json({ error: 'Nest ID is required' });
    if (typeof pteroNestId !== 'number' || isNaN(pteroNestId)) {
      return res.status(400).json({ error: 'Nest ID must be a valid number' });
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Nest name is required' });
    }
    if (name.trim().length > 255) {
      return res.status(400).json({ error: 'Nest name must be 255 characters or less' });
    }

    const pteroNests = await getPteroNests();
    const nest = pteroNests.find(n => n.id === pteroNestId);
    if (!nest) return res.status(404).json({ error: 'Nest not found in panel' });

    const displayName = name || nest.name;
    await query('INSERT INTO nests (ptero_nest_id, name) VALUES (?, ?)', [pteroNestId, displayName]);
    const [inserted] = await query('SELECT * FROM nests WHERE ptero_nest_id = ?', [pteroNestId]);
    res.status(201).json({ nest: inserted });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Nest already added' });
    }
    res.status(500).json({ error: 'Failed to add nest: ' + err.message });
  }
});

router.put('/settings/nests/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, logo, description, unavailable } = req.body;
    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) return res.status(400).json({ error: 'Name cannot be empty' });
    if (name && name.trim().length > 255) return res.status(400).json({ error: 'Name must be 255 characters or less' });
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
    if (logo !== undefined) { updates.push('logo = ?'); params.push(logo || null); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description || null); }
    if (unavailable !== undefined) { updates.push('unavailable = ?'); params.push(unavailable ? 1 : 0); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(id);
    await query(`UPDATE nests SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update nest: ' + err.message });
  }
});

router.delete('/settings/nests/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [nest] = await query('SELECT ptero_nest_id FROM nests WHERE id = ?', [id]);
    if (!nest) return res.status(404).json({ error: 'Nest not found' });
    await query('DELETE FROM egg_resources WHERE ptero_nest_id = ?', [nest.ptero_nest_id]);
    await query('DELETE FROM nests WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete nest' });
  }
});

// ─── Settings: Eggs ─────────────────────────────────────
router.get('/settings/nests/:nestId/eggs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const nestId = parseInt(req.params.nestId, 10);
    const pteroEggs = await getPteroNestEggs(nestId);
    const resources = await query('SELECT * FROM egg_resources WHERE ptero_nest_id = ?', [nestId]);
    const resourceMap = {};
    for (const r of resources) {
      resourceMap[r.ptero_egg_id] = r;
    }
    const eggs = pteroEggs.map(e => ({
      ...e,
      customResources: resourceMap[e.id] || null,
    }));
    res.json({ eggs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch eggs: ' + err.message });
  }
});

router.get('/settings/eggs/:nestId/:eggId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { nestId, eggId } = req.params;
    const [resources] = await query('SELECT * FROM egg_resources WHERE ptero_nest_id = ? AND ptero_egg_id = ?', [parseInt(nestId, 10), parseInt(eggId, 10)]);
    let eggDetails = null;
    try {
      eggDetails = await getEgg(parseInt(nestId, 10), parseInt(eggId, 10));
    } catch {}
    res.json({ resources: resources || null, egg: eggDetails });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch egg settings' });
  }
});

router.put('/settings/eggs/:nestId/:eggId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const nestId = parseInt(req.params.nestId, 10);
    const eggId = parseInt(req.params.eggId, 10);
    if (isNaN(nestId) || isNaN(eggId)) return res.status(400).json({ error: 'Invalid nest or egg ID' });
    const { cpu_limit, memory_limit, disk_limit, logo, unavailable } = req.body;

    const sanitized = {
      cpu_limit: (cpu_limit != null && !isNaN(Number(cpu_limit))) ? Number(cpu_limit) : null,
      memory_limit: (memory_limit != null && !isNaN(Number(memory_limit))) ? Number(memory_limit) : null,
      disk_limit: (disk_limit != null && !isNaN(Number(disk_limit))) ? Number(disk_limit) : null,
      logo: logo !== undefined ? (logo || null) : undefined,
      unavailable: unavailable !== undefined ? (unavailable ? 1 : 0) : undefined,
    };

    if (sanitized.cpu_limit != null && sanitized.cpu_limit < 0) return res.status(400).json({ error: 'CPU limit cannot be negative' });
    if (sanitized.memory_limit != null && sanitized.memory_limit < 0) return res.status(400).json({ error: 'Memory limit cannot be negative' });
    if (sanitized.disk_limit != null && sanitized.disk_limit < 0) return res.status(400).json({ error: 'Disk limit cannot be negative' });

    const [existing] = await query('SELECT id FROM egg_resources WHERE ptero_nest_id = ? AND ptero_egg_id = ?', [nestId, eggId]);
    if (existing) {
      const updates = ['cpu_limit = ?', 'memory_limit = ?', 'disk_limit = ?'];
      const vals = [sanitized.cpu_limit, sanitized.memory_limit, sanitized.disk_limit];
      if (sanitized.logo !== undefined) { updates.push('logo = ?'); vals.push(sanitized.logo); }
      if (sanitized.unavailable !== undefined) { updates.push('unavailable = ?'); vals.push(sanitized.unavailable); }
      vals.push(existing.id);
      await query(`UPDATE egg_resources SET ${updates.join(', ')} WHERE id = ?`, vals);
    } else {
      const cols = ['ptero_nest_id', 'ptero_egg_id', 'cpu_limit', 'memory_limit', 'disk_limit'];
      const vals = [nestId, eggId, sanitized.cpu_limit, sanitized.memory_limit, sanitized.disk_limit];
      if (sanitized.logo !== undefined) { cols.push('logo'); vals.push(sanitized.logo); }
      if (sanitized.unavailable !== undefined) { cols.push('unavailable'); vals.push(sanitized.unavailable); }
      await query(`INSERT INTO egg_resources (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save egg settings: ' + err.message });
  }
});

router.post('/settings/eggs/:nestId/:eggId/apply-all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { nestId, eggId } = req.params;
    const { cpu_limit, memory_limit, disk_limit } = req.body;

    const sanitized = {
      cpu_limit: (cpu_limit != null && !isNaN(Number(cpu_limit))) ? Number(cpu_limit) : null,
      memory_limit: (memory_limit != null && !isNaN(Number(memory_limit))) ? Number(memory_limit) : null,
      disk_limit: (disk_limit != null && !isNaN(Number(disk_limit))) ? Number(disk_limit) : null,
    };

    if (sanitized.cpu_limit != null && sanitized.cpu_limit < 0) return res.status(400).json({ error: 'CPU limit cannot be negative' });
    if (sanitized.memory_limit != null && sanitized.memory_limit < 0) return res.status(400).json({ error: 'Memory limit cannot be negative' });
    if (sanitized.disk_limit != null && sanitized.disk_limit < 0) return res.status(400).json({ error: 'Disk limit cannot be negative' });

    // Save to egg_resources first
    const [existing] = await query('SELECT id FROM egg_resources WHERE ptero_nest_id = ? AND ptero_egg_id = ?', [nestId, eggId]);
    if (existing) {
      await query('UPDATE egg_resources SET cpu_limit = ?, memory_limit = ?, disk_limit = ? WHERE id = ?',
        [sanitized.cpu_limit, sanitized.memory_limit, sanitized.disk_limit, existing.id]);
    } else {
      await query('INSERT INTO egg_resources (ptero_nest_id, ptero_egg_id, cpu_limit, memory_limit, disk_limit) VALUES (?, ?, ?, ?, ?)',
        [nestId, eggId, sanitized.cpu_limit, sanitized.memory_limit, sanitized.disk_limit]);
    }

    // Find all panel servers using this egg
    const pteroIds = await getPergoServerIdsByEgg(parseInt(nestId, 10), parseInt(eggId, 10));

    if (pteroIds.length === 0) {
      return res.json({ success: true, updated: 0, total: 0 });
    }

    const limits = {};
    if (sanitized.cpu_limit != null) limits.cpu = sanitized.cpu_limit;
    if (sanitized.memory_limit != null) limits.memory = sanitized.memory_limit;
    if (sanitized.disk_limit != null) limits.disk = sanitized.disk_limit;

    let updated = 0;
    for (const id of pteroIds) {
      try {
        await updatePteroServerBuild(id, limits);
        updated++;
      } catch (err) {
        console.error(`Failed to update server #${id} build:`, err.message);
      }
    }

    res.json({ success: true, updated, total: pteroIds.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to apply resources to all servers: ' + err.message });
  }
});

export default router;
