import { Router } from 'express';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin, generateSecret, verify, generateURI } from 'otplib';
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import argon2 from 'argon2';

import { query } from '../config/db.js';
import { authenticateToken, generateToken } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';

const totp = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

function generateRecoveryCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(4).toString('hex').toUpperCase();
    const code = bytes.match(/.{4}/g).join('-');
    codes.push(code);
  }
  return codes;
}

function hashRecoveryCode(code) {
  return createHash('sha256').update(code).digest('hex');
}

function gravatarHash(email) {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

router.get('/totp/status', authenticateToken, async (req, res) => {
  try {
    const users = await query('SELECT totp_enabled FROM users WHERE id = ?', [req.user.userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ enabled: !!users[0].totp_enabled });
  } catch (err) {
    console.error('TOTP status error:', err.message);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

router.post('/totp/setup', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const users = await query('SELECT id, email, totp_secret, totp_enabled FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    if (users[0].totp_enabled) {
      return res.status(400).json({ error: 'Two-factor authentication is already enabled' });
    }

    const secret = generateSecret();
    const otpauth = generateURI({issuer: 'ZeroHost', label: req.user.email, secret});
    const qrCode = await QRCode.toDataURL(otpauth);

    await query('UPDATE users SET totp_secret = ? WHERE id = ?', [secret, userId]);

    res.json({ secret, qrCode });
  } catch (err) {
    console.error('TOTP setup error:', err.message);
    res.status(500).json({ error: 'Failed to setup two-factor authentication' });
  }
});

router.post('/totp/enable', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.userId;

    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    const users = await query('SELECT id, totp_secret, totp_enabled FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    if (users[0].totp_enabled) {
      return res.status(400).json({ error: 'Two-factor authentication is already enabled' });
    }
    if (!users[0].totp_secret) {
      return res.status(400).json({ error: 'Please start the setup first' });
    }

    const verifyResult = await verify({ token: code, secret: users[0].totp_secret });
    if (!verifyResult.valid) {
      return res.status(400).json({ error: 'Invalid verification code. Please try again.' });
    }

    const recoveryCodes = generateRecoveryCodes(8);
    const hashedCodes = recoveryCodes.map(hashRecoveryCode);

    await query(
      'UPDATE users SET totp_enabled = 1, recovery_codes = ? WHERE id = ?',
      [JSON.stringify(hashedCodes), userId]
    );

    await logActivity(userId, 'totp_enabled', 'Enabled two-factor authentication');

    res.json({ message: 'Two-factor authentication enabled successfully', recoveryCodes });
  } catch (err) {
    console.error('TOTP enable error:', err.message);
    res.status(500).json({ error: 'Failed to enable two-factor authentication' });
  }
});

router.post('/totp/disable', authenticateToken, async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user.userId;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const users = await query('SELECT id, password_hash FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const valid = await argon2.verify(users[0].password_hash, password, { type: argon2.argon2id });
    if (!valid) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }

    await query(
      'UPDATE users SET totp_secret = NULL, totp_enabled = 0, recovery_codes = NULL WHERE id = ?',
      [userId]
    );

    await logActivity(userId, 'totp_disabled', 'Disabled two-factor authentication');

    res.json({ message: 'Two-factor authentication disabled successfully' });
  } catch (err) {
    console.error('TOTP disable error:', err.message);
    res.status(500).json({ error: 'Failed to disable two-factor authentication' });
  }
});

router.post('/totp/verify', async (req, res) => {
  try {
    const { code, tempToken } = req.body;

    if (!code || !tempToken) {
      return res.status(400).json({ error: 'Code and temporary token are required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    if (!decoded.totpTemp) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const userId = decoded.userId;

    const users = await query(
      `SELECT id, email, username, totp_secret, totp_enabled, recovery_codes,
              is_admin, restricted, token_version, ptero_user_id,
              first_name, last_name, email_verified, auth_restricted
       FROM users WHERE id = ?`,
      [userId]
    );
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = users[0];
    if (!user.totp_enabled) {
      return res.status(400).json({ error: 'Two-factor authentication is not enabled' });
    }
    if (user.auth_restricted) {
      return res.status(403).json({ error: 'Your account has been restricted.' });
    }

    const verifyResult = await verify({ token: code, secret: user.totp_secret });
    if (!verifyResult.valid) {
      return res.status(401).json({ error: 'Invalid verification code' });
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

    await query('UPDATE users SET user_agent = ? WHERE id = ?', [
      (req.headers['user-agent'] || 'unknown').toString().slice(0, 512),
      user.id
    ]).catch(() => {});

    await logActivity(userId, 'login_totp', 'Signed in with two-factor authentication');

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
    console.error('TOTP verify error:', err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/totp/recovery', async (req, res) => {
  try {
    const { code, tempToken } = req.body;

    if (!code || !tempToken) {
      return res.status(400).json({ error: 'Recovery code and temporary token are required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    if (!decoded.totpTemp) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const userId = decoded.userId;
    const users = await query(
      `SELECT * FROM users WHERE id = ?`,
      [userId]
    );
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = users[0];
    if (!user.totp_enabled || !user.recovery_codes) {
      return res.status(400).json({ error: 'No recovery codes available' });
    }

    const storedCodes = JSON.parse(user.recovery_codes);
    const hashedInput = hashRecoveryCode(code.toUpperCase());

    const codeIndex = storedCodes.findIndex(h => h === hashedInput);
    if (codeIndex === -1) {
      return res.status(401).json({ error: 'Invalid recovery code' });
    }

    storedCodes.splice(codeIndex, 1);
    await query('UPDATE users SET recovery_codes = ? WHERE id = ?', [JSON.stringify(storedCodes), userId]);

    await logActivity(userId, 'recovery_code_used', 'Used a recovery code to sign in');

    const jwtToken = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      pteroId: user.ptero_user_id,
      isAdmin: !!user.is_admin,
      restricted: !!user.restricted,
      tokenVersion: user.token_version,
    });

    res.cookie('token', jwtToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 2 * 60 * 60 * 1000,
    });

    await query('UPDATE users SET user_agent = ? WHERE id = ?', [
      (req.headers['user-agent'] || 'unknown').toString().slice(0, 512),
      user.id
    ]).catch(() => {});

    res.json({
      token: jwtToken,
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
    console.error('TOTP recovery error:', err.message);
    res.status(500).json({ error: 'Recovery code verification failed' });
  }
});

router.get('/totp/recovery-codes', authenticateToken, async (req, res) => {
  try {
    const users = await query('SELECT totp_enabled, recovery_codes FROM users WHERE id = ?', [req.user.userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = users[0];
    if (!user.totp_enabled) {
      return res.json({ enabled: false, remaining: 0, codes: [] });
    }

    const codes = user.recovery_codes ? JSON.parse(user.recovery_codes) : [];
    res.json({
      enabled: true,
      remaining: codes.length,
    });
  } catch (err) {
    console.error('TOTP recovery codes error:', err.message);
    res.status(500).json({ error: 'Failed to fetch recovery codes' });
  }
});

router.post('/totp/recovery-codes/regenerate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const users = await query('SELECT totp_enabled FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    if (!users[0].totp_enabled) {
      return res.status(400).json({ error: 'Two-factor authentication is not enabled' });
    }

    const newCodes = generateRecoveryCodes(8);
    const hashedCodes = newCodes.map(hashRecoveryCode);

    await query('UPDATE users SET recovery_codes = ? WHERE id = ?', [JSON.stringify(hashedCodes), userId]);

    await logActivity(userId, 'recovery_codes_regenerated', 'Regenerated recovery codes');

    res.json({ recoveryCodes: newCodes });
  } catch (err) {
    console.error('TOTP regenerate recovery codes error:', err.message);
    res.status(500).json({ error: 'Failed to regenerate recovery codes' });
  }
});

export default router;
