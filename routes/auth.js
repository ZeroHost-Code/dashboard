import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';

import { query } from '../config/db.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';
import { createPteroUser, updatePteroPassword, updatePteroEmail, deletePteroUser, getServersByUser, deletePteroServer } from '../services/pyrodactyl.js';
import { verifyCap } from '../config/cap.js';
import { logActivity } from '../services/activity.js';
import { sendVerificationEmail, sendEmailChangeLink, sendEmailChangeCode } from '../services/email.js';

const router = Router();

router.get('/check-vpn', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const forwarded = req.headers['x-forwarded-for'] || 'none';
    const isVpn = await isVpnOrProxy(ip);
    res.json({ vpn: isVpn, ip, forwarded });
  } catch {
    res.json({ vpn: false });
  }
});

function gravatarHash(email) {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

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

function isPrivateIp(ip) {
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0' || ip === '::ffff:127.0.0.1') return true;
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) return true;
  if (ip.startsWith('fc00:') || ip.startsWith('fd00:') || ip.startsWith('fe80:')) return true;
  if (ip.startsWith('::ffff:192.168.') || ip.startsWith('::ffff:10.') || ip.startsWith('::ffff:172.16.')) return true;
  return false;
}

async function isVpnOrProxy(ip) {
  if (isPrivateIp(ip)) {
    console.log('[VPN] Skipping private IP:', ip);
    return false;
  }

  const cleanIp = ip.replace(/^::ffff:/, '');

  try {
    const res = await fetchWithTimeout(`http://ip-api.com/json/${cleanIp}?fields=proxy,hosting,isp,org,query`);
    const data = await res.json();
    console.log('[VPN] ip-api response for', cleanIp, ':', JSON.stringify(data));
    return data.proxy === true || data.hosting === true;
  } catch (err) {
    console.log('[VPN] ip-api failed for', cleanIp, ':', err.message);
  }

  try {
    const res = await fetchWithTimeout(`https://ipinfo.io/${cleanIp}/json`);
    const data = await res.json();
    console.log('[VPN] ipinfo response for', cleanIp, ':', JSON.stringify({ org: data.org }));
    const orgLower = (data.org || '').toLowerCase();
    if (orgLower.includes('vpn') || orgLower.includes('proxy') || orgLower.includes('tor')) {
      return true;
    }
  } catch (err) {
    console.log('[VPN] ipinfo failed for', cleanIp, ':', err.message);
  }

  return false;
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
    const userAgent = (req.headers['user-agent'] || 'unknown').toString().slice(0, 512);

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

    if (await isVpnOrProxy(ip)) {
      return res.status(403).json({ error: 'VPN or proxy detected. Please disable your VPN for security reasons.' });
    }

    const delay = getLoginDelay(ip);
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }

    if (!await verifyCap(capToken)) {
      recordLoginAttempt(ip, false);
      return res.status(400).json({ error: 'Please complete the security check' });
    }

    const ipCount = await query('SELECT COUNT(DISTINCT user_id) AS cnt FROM user_ips WHERE ip_address = ?', [ip]);
    if (ipCount[0].cnt >= 1) {
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
      'INSERT INTO users (email, username, password_hash, ptero_user_id, ptero_uuid, first_name, last_name, password_set, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
      [email, username, passwordHash, pteroUser.id, pteroUser.uuid, username, 'User', userAgent]
    );
    const localUserId = insertResult.insertId;

    await query('INSERT INTO user_ips (user_id, ip_address, user_agent) VALUES (?, ?, ?)', [localUserId, ip, userAgent]).catch(err => {
      console.error('Failed to log IP:', err.message);
    });

    const verificationToken = randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await query(
      'UPDATE users SET verification_token = ?, verification_token_expires = ? WHERE id = ?',
      [verificationToken, tokenExpires, localUserId]
    );

    try {
      await sendVerificationEmail(email, username, verificationToken);
    } catch (err) {
      console.error('Failed to send verification email:', err.message);
    }

    await logActivity(localUserId, 'account_registered', 'Created account — verification email sent');

    recordLoginAttempt(ip, true);

    res.status(201).json({
      message: 'Account created successfully. Please check your email to verify your account.',
      emailSent: true,
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

router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    const users = await query(
      'SELECT id, email, username, email_verified, verification_token_expires FROM users WHERE verification_token = ?',
      [token]
    );

    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const user = users[0];

    if (user.email_verified) {
      return res.json({ message: 'Email already verified. You can now sign in.', alreadyVerified: true });
    }

    if (new Date(user.verification_token_expires) < new Date()) {
      return res.status(400).json({ error: 'Verification token has expired. Please register again.' });
    }

    await query(
      'UPDATE users SET email_verified = 1, verification_token = NULL, verification_token_expires = NULL WHERE id = ?',
      [user.id]
    );

    await logActivity(user.id, 'email_verified', 'Verified email address');

    const gravatarHash = createHash('md5').update(user.email.trim().toLowerCase()).digest('hex');

    const token_jwt = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      pteroId: null,
      isAdmin: false,
      restricted: false,
      tokenVersion: 0,
    });

    res.cookie('token', token_jwt, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 2 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Email verified successfully!',
      token: token_jwt,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.username,
        lastName: 'User',
        isAdmin: false,
        restricted: false,
        gravatarHash,
      },
    });
  } catch (err) {
    console.error('Verify email error:', err.message);
    res.status(500).json({ error: 'Email verification failed' });
  }
});

router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const users = await query('SELECT id, email, username, email_verified FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.json({ message: 'If an account with that email exists, a verification link has been sent.' });
    }

    const user = users[0];
    if (user.email_verified) {
      return res.json({ message: 'Email already verified. You can now sign in.' });
    }

    const verificationToken = randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await query(
      'UPDATE users SET verification_token = ?, verification_token_expires = ? WHERE id = ?',
      [verificationToken, tokenExpires, user.id]
    );

    try {
      await sendVerificationEmail(user.email, user.username, verificationToken);
    } catch (err) {
      console.error('Failed to send verification email:', err.message);
      return res.status(500).json({ error: 'Failed to send verification email. Please try again later.' });
    }

    await logActivity(user.id, 'verification_resent', 'Resent verification email');

    res.json({ message: 'Verification email sent. Check your inbox.' });
  } catch (err) {
    console.error('Resend verification error:', err.message);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password, capToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const ip = getClientIp(req);
    const userAgent = (req.headers['user-agent'] || 'unknown').toString().slice(0, 512);

    // VPN / Proxy detection — checked first for security
    if (await isVpnOrProxy(ip)) {
      return res.status(403).json({ error: 'VPN or proxy detected. Please disable your VPN for security reasons.' });
    }

    // Cap verification
    if (!await verifyCap(capToken)) {
      recordLoginAttempt(ip, false);
      return res.status(400).json({ error: 'Please complete the security check' });
    }

    // Progressive delay applied only after validation to prevent resource exhaustion
    const delay = getLoginDelay(ip);
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
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

    if (!user.email_verified) {
      recordLoginAttempt(ip, false);
      return res.status(403).json({ error: 'Please verify your email before signing in. Check your inbox for the verification link.' });
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      pteroId: user.ptero_user_id,
      isAdmin: !!user.is_admin,
      restricted: !!user.restricted,
      tokenVersion: user.token_version,
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 2 * 60 * 60 * 1000,
    });

    recordLoginAttempt(ip, true);

    await query('UPDATE users SET user_agent = ? WHERE id = ?', [userAgent, user.id]).catch(err => {
      console.error('Failed to update user_agent:', err.message);
    });
    await query('INSERT INTO user_ips (user_id, ip_address, user_agent) VALUES (?, ?, ?)', [user.id, ip, userAgent]).catch(err => {
      console.error('Failed to log login IP:', err.message);
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
        isAdmin: !!user.is_admin,
        restricted: !!user.restricted,
        emailVerified: !!user.email_verified,
        gravatarHash: gravatarHash(user.email),
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

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'Invalid input types' });
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
    const userId = req.user?.userId;

    if (!newEmail || !password) {
      return res.status(400).json({ error: 'New email and password are required' });
    }

    if (typeof newEmail !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input types' });
    }

    if (!validateEmail(newEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    if (newEmail === user.email) {
      return res.status(400).json({ error: 'New email is the same as current email' });
    }

    const valid = await argon2.verify(user.password_hash, password, { type: argon2.argon2id });
    if (!valid) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }

    const existing = await query('SELECT id FROM users WHERE email = ? AND id != ?', [newEmail, userId]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email is already in use' });
    }

    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 30 * 60 * 1000);

    await query(
      'UPDATE users SET pending_email = ?, email_change_token = ?, email_change_expires = ? WHERE id = ?',
      [newEmail, token, expires, userId]
    );

    await sendEmailChangeLink(user.email, user.username, token, newEmail);

    res.json({ message: 'Confirmation link sent to your current email' });
  } catch (err) {
    console.error('Change email initiate error:', err.message);
    res.status(500).json({ error: 'Failed to initiate email change' });
  }
});

router.get('/change-email/verify', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const users = await query(
      'SELECT * FROM users WHERE email_change_token = ? AND email_change_expires > NOW()',
      [token]
    );

    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const user = users[0];
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeExpires = new Date(Date.now() + 30 * 60 * 1000);

    await query(
      'UPDATE users SET email_change_code = ?, email_change_expires = ? WHERE id = ?',
      [code, codeExpires, user.id]
    );

    await sendEmailChangeCode(user.pending_email, user.username, code);

    res.json({ message: 'Verification code sent to your new email', pendingEmail: user.pending_email });
  } catch (err) {
    console.error('Change email verify error:', err.message);
    res.status(500).json({ error: 'Failed to verify email change' });
  }
});

router.post('/change-email/confirm', authenticateToken, sensitiveLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user?.userId;

    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    const users = await query(
      'SELECT * FROM users WHERE id = ? AND email_change_code = ? AND email_change_expires > NOW()',
      [userId, code]
    );

    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    const user = users[0];
    const newEmail = user.pending_email;

    try {
      await updatePteroEmail(user.ptero_user_id, newEmail);
    } catch (err) {
      console.error('Failed to update Pyrodactyl email:', err.message);
      return res.status(500).json({ error: 'Failed to update email on panel' });
    }

    await query(
      'UPDATE users SET email = ?, pending_email = NULL, email_change_token = NULL, email_change_code = NULL, email_change_expires = NULL, token_version = token_version + 1 WHERE id = ?',
      [newEmail, userId]
    );

    await logActivity(userId, 'email_changed', `Changed email to ${newEmail}`);

    const [updatedUser] = await query('SELECT token_version FROM users WHERE id = ?', [userId]);

    const token = generateToken({
      userId: user.id,
      email: newEmail,
      username: user.username,
      pteroId: user.ptero_user_id,
      isAdmin: !!user.is_admin,
      restricted: !!user.restricted,
      tokenVersion: updatedUser.token_version,
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
        gravatarHash: gravatarHash(newEmail),
      },
      message: 'Email updated successfully',
    });
  } catch (err) {
    console.error('Change email confirm error:', err.message);
    res.status(500).json({ error: 'Failed to confirm email change' });
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

    await logActivity(user.id, 'account_deleted', 'Deleted account');

    // Delete from local DB (cascades to user_ips)
    await query('DELETE FROM users WHERE id = ?', [user.id]);

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Delete account error:', err.message);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Bump token_version to invalidate all existing sessions
    await query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.userId]);
  } catch (err) {
    console.error('Logout token_version bump failed:', err.message);
  }
  res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'strict' });
  res.json({ message: 'Logged out' });
});

router.get('/export-data', authenticateToken, sensitiveLimiter, async (req, res) => {
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

export { isVpnOrProxy, getClientIp };

export default router;
