import { Router } from 'express';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { query } from '../config/db.js';
import { generateToken } from '../middleware/auth.js';
import { createPteroUser, getPteroUserByEmail, updatePteroPassword, updatePteroEmail, deletePteroUser, getServersByUser, deletePteroServer } from '../services/pterodactyl.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

import { verifyTurnstile } from '../config/turnstile.js';
import { v4 as uuidv4 } from 'uuid';

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || '0.0.0.0';
}

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function isVpnOrProxy(ip) {
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0' ||
      ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
    return false;
  }
  try {
    const res = await fetchWithTimeout(`http://ip-api.com/json/${ip}?fields=proxy,hosting,query`);
    const data = await res.json();
    return data.proxy === true || data.hosting === true;
  } catch {
    return false;
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateUsername(username) {
  return /^[a-zA-Z0-9_-]{3,32}$/.test(username);
}

router.post('/register', async (req, res) => {
  let createdPteroUserId = null;
  try {
    const { email, username, password, cfTurnstile, rgpdConsent } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username and password are required' });
    }

    if (!rgpdConsent) {
      return res.status(400).json({ error: 'You must accept the privacy policy to create an account.' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (!validateUsername(username)) {
      return res.status(400).json({ error: 'Username must be 3-32 chars (letters, numbers, underscore, hyphen)' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (!await verifyTurnstile(cfTurnstile)) {
      return res.status(400).json({ error: 'Please complete the security check' });
    }

    const ip = getClientIp(req);

    if (await isVpnOrProxy(ip)) {
      return res.status(403).json({ error: 'VPNs and proxies are not allowed. Please disable them to register.' });
    }

    const ipCount = await query('SELECT COUNT(DISTINCT user_id) AS cnt FROM user_ips WHERE ip_address = ?', [ip]);
    if (ipCount[0].cnt >= 2) {
      return res.status(403).json({ error: 'Too many accounts registered from this IP address.' });
    }

    const existing = await query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email or username already exists' });
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const pteroUser = await createPteroUser({
      email,
      username,
      firstName: username,
      lastName: 'User',
      password,
    });
    createdPteroUserId = pteroUser.id;

    const insertResult = await query(
      'INSERT INTO users (email, username, password_hash, ptero_user_id, ptero_uuid, first_name, last_name, password_set) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      [email, username, passwordHash, pteroUser.id, pteroUser.uuid, username, 'User']
    );
    const localUserId = insertResult.insertId;

    await query('INSERT INTO user_ips (user_id, ip_address) VALUES (?, ?)', [localUserId, ip]).catch(err => {
      console.error('Failed to log IP:', err.message);
    });

    const token = generateToken({
      userId: localUserId,
      email,
      username,
      pteroId: pteroUser.id,
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 2 * 60 * 60 * 1000,
    });

    res.status(201).json({
      token,
      user: {
        id: localUserId,
        email,
        username,
        firstName: username,
        lastName: 'User',
      },
    });
  } catch (err) {
    console.error('Register error:', err.message);
    if (createdPteroUserId) {
      deletePteroUser(createdPteroUserId).catch(e =>
        console.error('Failed to clean up Pterodactyl user after registration failure:', e.message)
      );
    }
    if (err.message.includes('already exists') || err.message.includes('already been taken')) {
      return res.status(409).json({ error: 'A user with this email or username already exists on the panel' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password, cfTurnstile } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Turnstile verification
    if (!await verifyTurnstile(cfTurnstile)) {
      return res.status(400).json({ error: 'Please complete the security check' });
    }

    // VPN / Proxy detection
    const ip = getClientIp(req);
    if (await isVpnOrProxy(ip)) {
      return res.status(403).json({ error: 'VPNs and proxies are not allowed. Please disable them to sign in.' });
    }

    const users = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      console.log('[LOGIN] User not found for email:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];

    console.log('[LOGIN] User found:', { id: user.id, email: user.email, hashFirstChars: user.password_hash?.slice(0, 30), hashType: typeof user.password_hash });

    const validPassword = await argon2.verify(user.password_hash, password, { type: argon2.argon2id });
    if (!validPassword) {
      console.log('[LOGIN] Password mismatch for user:', user.id);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      pteroId: user.ptero_user_id,
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 2 * 60 * 60 * 1000,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        pteroId: user.ptero_user_id,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const pteroId = req.user?.pteroId;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const users = await query('SELECT * FROM users WHERE ptero_user_id = ?', [pteroId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    const valid = await argon2.verify(user.password_hash, currentPassword, { type: argon2.argon2id });
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);

    try {
      await updatePteroPassword(pteroId, newPassword);
    } catch (err) {
      console.error('Failed to update Pterodactyl password:', err.message);
    }

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err.message);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.post('/change-email', authenticateToken, async (req, res) => {
  try {
    const { newEmail, password } = req.body;
    const pteroId = req.user?.pteroId;
    const userId = req.user?.userId;

    if (!newEmail || !password) {
      return res.status(400).json({ error: 'New email and password are required' });
    }

    if (!validateEmail(newEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    const valid = await argon2.verify(user.password_hash, password, { type: argon2.argon2id });
    if (!valid) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }

    // Check if new email is already taken
    const existing = await query('SELECT id FROM users WHERE email = ? AND id != ?', [newEmail, userId]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email is already in use' });
    }

    // Update Pterodactyl
    try {
      await updatePteroEmail(pteroId, newEmail);
    } catch (err) {
      console.error('Failed to update Pterodactyl email:', err.message);
      return res.status(500).json({ error: 'Failed to update email on panel' });
    }

    // Update local DB
    await query('UPDATE users SET email = ? WHERE id = ?', [newEmail, userId]);

    // Generate new token with updated email
    const token = generateToken({
      userId: user.id,
      email: newEmail,
      username: user.username,
      pteroId: user.ptero_user_id,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: newEmail,
        username: user.username,
        pteroId: user.ptero_user_id,
        firstName: user.first_name,
        lastName: user.last_name,
      },
      message: 'Email updated successfully',
    });
  } catch (err) {
    console.error('Change email error:', err.message);
    res.status(500).json({ error: 'Failed to change email' });
  }
});

router.post('/delete-account', authenticateToken, async (req, res) => {
  try {
    const { password } = req.body;
    const pteroId = req.user?.pteroId;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const users = await query('SELECT * FROM users WHERE ptero_user_id = ?', [pteroId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    const valid = await argon2.verify(user.password_hash, password, { type: argon2.argon2id });
    if (!valid) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }

    // Delete all Pterodactyl servers first
    try {
      const servers = await getServersByUser(pteroId);
      for (const server of servers) {
        try {
          await deletePteroServer(server.id);
        } catch (err) {
          console.error(`Failed to delete server ${server.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('Failed to fetch servers for deletion:', err.message);
    }

    // Delete Pterodactyl user
    try {
      await deletePteroUser(pteroId);
    } catch (err) {
      console.error('Failed to delete Pterodactyl user:', err.message);
    }

    // Delete from local DB (cascades to user_ips)
    await query('DELETE FROM users WHERE id = ?', [user.id]);

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Delete account error:', err.message);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'strict' });
  res.json({ message: 'Logged out' });
});

router.get('/export-data', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const pteroId = req.user.pteroId;

    const users = await query('SELECT id, email, username, first_name, last_name, ptero_user_id, ptero_uuid, created_at FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = users[0];

    const ips = await query('SELECT ip_address, created_at FROM user_ips WHERE user_id = ?', [userId]);

    let servers = [];
    try {
      servers = await getServersByUser(pteroId);
    } catch {}

    let serverMeta = [];
    try {
      for (const s of servers) {
        const meta = await query('SELECT * FROM server_meta WHERE ptero_server_id = ?', [s.id]);
        if (meta.length > 0) serverMeta.push(meta[0]);
      }
    } catch {}

    res.json({
      exportDate: new Date().toISOString(),
      dataController: 'ZeroHost',
      personalData: {
        account: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          createdAt: user.created_at,
          pterodactylId: user.ptero_user_id,
          pterodactylUuid: user.ptero_uuid,
        },
        security: {
          loggedIpAddresses: ips.map(ip => ({
            ipAddress: ip.ip_address,
            loggedAt: ip.created_at,
          })),
        },
        servers: servers.map(s => ({
          id: s.id,
          name: s.name,
          egg: s.egg,
          node: s.node,
          status: s.status,
          createdAt: s.created_at,
        })),
        serverMeta: serverMeta.map(m => ({
          id: m.id,
          createdAt: m.created_at,
          expiresAt: m.expires_at,
          status: m.status,
        })),
      },
      rgpdInfo: {
        rights: [
          'Right of access (Art. 15): You are currently exercising this right.',
          'Right to rectification (Art. 16): Update your data in account settings.',
          'Right to erasure (Art. 17): Delete your account in account settings.',
          'Right to data portability (Art. 20): This JSON export fulfills this right.',
        ],
        contact: 'Via our status page: https://status.zero-host.org',
      },
    });
  } catch (err) {
    console.error('Export data error:', err.message);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

export default router;
