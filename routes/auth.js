import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { readdir, writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { query } from '../config/db.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';
import { createPteroUser, updatePteroPassword, updatePteroEmail, deletePteroUser, getServersByUser, deletePteroServer } from '../services/pyrodactyl.js';
import { verifyCap } from '../config/cap.js';
import { logActivity } from '../services/activity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, '..', 'uploads', 'avatars');

const router = Router();

const loginAttempts = new Map();

function getLoginDelay(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return 0;
  const sinceFirst = now - entry.firstAttempt;
  if (sinceFirst > 15 * 60 * 1000) {
    loginAttempts.delete(ip);
    return 0;
  }
  if (entry.count <= 3) return 0;
  if (entry.count <= 5) return 1000;
  if (entry.count <= 8) return 3000;
  if (entry.count <= 12) return 5000;
  return 10000;
}

function recordLoginAttempt(ip, success) {
  if (success) {
    loginAttempts.delete(ip);
    return;
  }
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (entry) {
    entry.count++;
  } else {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
  }
}

setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [ip, entry] of loginAttempts) {
    if (entry.firstAttempt < cutoff) loginAttempts.delete(ip);
  }
}, 60 * 1000);

const MIME_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many sensitive operations, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

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
    const res = await fetchWithTimeout(`https://ip-api.com/json/${ip}?fields=proxy,hosting,query`);
    const data = await res.json();
    return data.proxy === true || data.hosting === true;
  } catch {
    return false;
  }
}

const MAX_EMAIL_LENGTH = 254;
const MAX_USERNAME_LENGTH = 32;
const MAX_PASSWORD_LENGTH = 128;

function validateEmail(email) {
  if (typeof email !== 'string' || email.length > MAX_EMAIL_LENGTH) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateUsername(username) {
  if (typeof username !== 'string' || username.length > MAX_USERNAME_LENGTH) return false;
  return /^[a-zA-Z0-9_-]{3,32}$/.test(username);
}

router.post('/register', async (req, res) => {
  let createdPteroUserId = null;
  try {
    const { email, username, password, capToken, rgpdConsent } = req.body;

    const ip = getClientIp(req);
    const delay = getLoginDelay(ip);
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username and password are required' });
    }

    if (typeof email !== 'string' || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input types' });
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

    if (password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: 'Password must be between 8 and 128 characters' });
    }

    if (!await verifyCap(capToken)) {
      recordLoginAttempt(ip, false);
      return res.status(400).json({ error: 'Please complete the security check' });
    }

    if (await isVpnOrProxy(ip)) {
      return res.status(403).json({ error: 'VPNs and proxies are not allowed. Please disable them to register.' });
    }

    const ipCount = await query('SELECT COUNT(DISTINCT user_id) AS cnt FROM user_ips WHERE ip_address = ?', [ip]);
    if (ipCount[0].cnt >= 2) {
      recordLoginAttempt(ip, false);
      return res.status(403).json({ error: 'Too many accounts registered from this IP address.' });
    }

    const existing = await query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existing.length > 0) {
      recordLoginAttempt(ip, false);
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

    await logActivity(localUserId, 'account_registered', 'Created account');

    recordLoginAttempt(ip, true);

    res.status(201).json({
      token,
      user: {
        id: localUserId,
        email,
        username,
        firstName: username,
        lastName: 'User',
        isAdmin: false,
        restricted: false,
      },
    });
  } catch (err) {
    console.error('Register error:', err.message);
    if (createdPteroUserId) {
      deletePteroUser(createdPteroUserId).catch(e =>
        console.error('Failed to clean up Pyrodactyl user after registration failure:', e.message)
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
    const { email, password, capToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const ip = getClientIp(req);
    const delay = getLoginDelay(ip);
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }

    // Cap verification
    if (!await verifyCap(capToken)) {
      recordLoginAttempt(ip, false);
      return res.status(400).json({ error: 'Please complete the security check' });
    }

    // VPN / Proxy detection
    
    if (await isVpnOrProxy(ip)) {
      return res.status(403).json({ error: 'VPNs and proxies are not allowed. Please disable them to sign in.' });
    }

    const users = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      recordLoginAttempt(ip, false);
      if (process.env.NODE_ENV !== 'production') console.log('[LOGIN] User not found for email:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];

    if (process.env.NODE_ENV !== 'production') console.log('[LOGIN] User found:', { id: user.id, email: user.email });

    if (user.auth_restricted) {
      return res.status(403).json({ error: 'Your account has been restricted. Contact support for assistance.' });
    }

    const validPassword = await argon2.verify(user.password_hash, password, { type: argon2.argon2id });
    if (!validPassword) {
      recordLoginAttempt(ip, false);
      if (process.env.NODE_ENV !== 'production') console.log('[LOGIN] Password mismatch for user:', user.id);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      pteroId: user.ptero_user_id,
      isAdmin: !!user.is_admin,
      tokenVersion: user.token_version,
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 2 * 60 * 60 * 1000,
    });

    recordLoginAttempt(ip, true);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        pteroId: user.ptero_user_id,
        firstName: user.first_name,
        lastName: user.last_name,
        isAdmin: !!user.is_admin,
        restricted: !!user.restricted,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/change-password', authenticateToken, sensitiveLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const pteroId = req.user?.pteroId;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8 || newPassword.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: 'New password must be between 8 and 128 characters' });
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

    await query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [passwordHash, user.id]);

    try {
      await updatePteroPassword(pteroId, newPassword);
    } catch (err) {
      console.error('Failed to update Pyrodactyl password:', err.message);
    }

    await logActivity(req.user.userId, 'password_changed', 'Changed password');
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err.message);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.post('/change-email', authenticateToken, sensitiveLimiter, async (req, res) => {
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

    // Update Pyrodactyl
    try {
      await updatePteroEmail(pteroId, newEmail);
    } catch (err) {
      console.error('Failed to update Pyrodactyl email:', err.message);
      return res.status(500).json({ error: 'Failed to update email on panel' });
    }

    // Update local DB
    await query('UPDATE users SET email = ? WHERE id = ?', [newEmail, userId]);

    await logActivity(userId, 'email_changed', `Changed email to ${newEmail}`);

    // Generate new token with updated email
    const token = generateToken({
      userId: user.id,
      email: newEmail,
      username: user.username,
      pteroId: user.ptero_user_id,
      isAdmin: !!user.is_admin,
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
        isAdmin: !!user.is_admin,
      },
      message: 'Email updated successfully',
    });
  } catch (err) {
    console.error('Change email error:', err.message);
    res.status(500).json({ error: 'Failed to change email' });
  }
});

router.post('/delete-account', authenticateToken, sensitiveLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user?.userId;
    const pteroId = req.user?.pteroId;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
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

    // Clean up Pyrodactyl first (before deleting local user)
    if (pteroId) {
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

      try {
        await deletePteroUser(pteroId);
      } catch (err) {
        console.error('Failed to delete Pyrodactyl user:', err.message);
      }
    }

    // Clean up avatar file
    try {
      if (existsSync(UPLOAD_DIR)) {
        const files = await readdir(UPLOAD_DIR);
        for (const file of files) {
          if (file.startsWith(`avatar_${user.id}.`)) {
            await unlink(join(UPLOAD_DIR, file));
          }
        }
      }
    } catch (err) {
      console.error('Failed to clean up avatar:', err.message);
    }

    await logActivity(user.id, 'account_deleted', 'Deleted account');

    // Delete from local DB (cascades to user_ips)
    await query('DELETE FROM users WHERE id = ?', [user.id]);

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Delete account error:', err.message);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

router.post('/upload-avatar', authenticateToken, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const matches = image.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid image format. Use PNG, JPEG, GIF, or WebP.' });
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];

    if (!MIME_TYPES[ext]) {
      return res.status(400).json({ error: 'Unsupported image format' });
    }

    const data = Buffer.from(matches[2], 'base64');

    if (data.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large. Maximum size is 2MB.' });
    }

    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const files = await readdir(UPLOAD_DIR);
    for (const file of files) {
      if (file.startsWith(`avatar_${req.user.userId}.`)) {
        await unlink(join(UPLOAD_DIR, file));
      }
    }

    const filename = `avatar_${req.user.userId}.${ext}`;
    const filePath = join(UPLOAD_DIR, filename);
    const resolvedPath = resolve(filePath);
    if (!resolvedPath.startsWith(resolve(UPLOAD_DIR))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await writeFile(resolvedPath, data);

    await query('UPDATE users SET avatar = ? WHERE id = ?', [filename, req.user.userId]);

    await logActivity(req.user.userId, 'avatar_updated', 'Updated profile picture');

    res.json({ message: 'Avatar updated successfully' });
  } catch (err) {
    console.error('Upload avatar error:', err.message);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

router.get('/avatar/:userId', async (req, res) => {
  try {
    const requestedId = parseInt(req.params.userId, 10);
    if (isNaN(requestedId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.userId !== requestedId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!existsSync(UPLOAD_DIR)) {
      return res.status(404).json({ error: 'No avatar found' });
    }

    const files = await readdir(UPLOAD_DIR);
    const avatarFile = files.find(f => f.startsWith(`avatar_${requestedId}.`));

    if (!avatarFile) {
      return res.status(404).json({ error: 'No avatar found' });
    }

    const resolvedPath = resolve(join(UPLOAD_DIR, avatarFile));
    if (!resolvedPath.startsWith(UPLOAD_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const mimeType = MIME_TYPES[extname(avatarFile).toLowerCase().slice(1)] || 'application/octet-stream';

    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'private, max-age=3600');
    res.sendFile(resolvedPath);
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('Avatar serve error:', err.message);
    res.status(500).json({ error: 'Failed to serve avatar' });
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
          pyrodactylId: user.ptero_user_id,
          pyrodactylUuid: user.ptero_uuid,
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
