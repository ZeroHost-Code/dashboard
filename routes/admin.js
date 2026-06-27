import { Router } from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { getAllServers, getServerById } from '../services/pyrodactyl.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
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

export default router;
