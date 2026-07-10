import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { authenticateToken } from '../middleware/auth.js';
import { createHash } from 'crypto';
import { query } from '../config/db.js';
import { generateToken } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';

const router = Router();

const passkeyRegisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many passkey registration attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const passkeyLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many passkey login attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const RP_NAME = 'ZeroHost';

function gravatarHash(email) {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

function getWebAuthnConfig(req) {
  if (process.env.WEBAUTHN_ORIGIN && process.env.WEBAUTHN_RP_ID) {
    return { origin: process.env.WEBAUTHN_ORIGIN, rpID: process.env.WEBAUTHN_RP_ID };
  }
  const host = req.headers.host || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http');
  return {
    origin: `${proto}://${host}`,
    rpID: host.split(':')[0],
  };
}

// Store challenges keyed by userId (register) or sessionToken (login)
// to prevent attacker-controlled lookup via clientDataJSON.challenge
const challengeMap = new Map();

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || '0.0.0.0';
}

router.post('/passkeys/register/begin', authenticateToken, passkeyRegisterLimiter, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rpID, origin } = getWebAuthnConfig(req);
    const user = await query(
      'SELECT id, email, username FROM users WHERE id = ?',
      [userId]
    );
    if (!user.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingKeys = await query(
      'SELECT credential_id, transports FROM passkeys WHERE user_id = ?',
      [userId]
    );

    const excludeCredentials = existingKeys.map(k => ({
      id: k.credential_id,
      type: 'public-key',
      transports: k.transports ? k.transports.split(',') : ['internal'],
    }));

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: user[0].email,
      userDisplayName: user[0].username,
      attestationType: 'none',
      excludeCredentials,
      userId: new TextEncoder().encode(String(userId).padStart(16, '0')),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
    });

    challengeMap.set(`register:${userId}`, {
      challenge: options.challenge,
      timestamp: Date.now(),
      userId,
    });

    res.json({ options });
  } catch (err) {
    console.error('Passkey register begin error:', err.message);
    res.status(500).json({ error: 'Failed to initiate passkey registration' });
  }
});

router.post('/passkeys/register/complete', authenticateToken, passkeyRegisterLimiter, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { response } = req.body;

    if (!response) {
      return res.status(400).json({ error: 'Registration response is required' });
    }

    const stored = challengeMap.get(`register:${userId}`);
    if (!stored) {
      return res.status(400).json({ error: 'No registration in progress. Please try again.' });
    }

    challengeMap.delete(`register:${userId}`);

    const { rpID, origin } = getWebAuthnConfig(req);
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Passkey verification failed' });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    await query(
      'INSERT INTO passkeys (user_id, credential_id, public_key, counter, transports, name) VALUES (?, ?, ?, ?, ?, ?)',
      [
        userId,
        credential.id,
        isoBase64URL.fromBuffer(credential.publicKey),
        credential.counter,
        (credential.transports || []).join(','),
        `Passkey (${credentialDeviceType}${credentialBackedUp ? ', backed up' : ''})`,
      ]
    );

    await logActivity(userId, 'passkey_registered', 'Registered a new passkey');

    res.json({ verified: true });
  } catch (err) {
    console.error('Passkey register complete error:', err.message);
    res.status(400).json({ error: 'Failed to complete passkey registration' });
  }
});

router.post('/passkeys/login/begin', passkeyLoginLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    let userId = null;
    let allowCredentials;

    if (email && typeof email === 'string') {
      const users = await query('SELECT id, email, username, auth_restricted FROM users WHERE email = ?', [email]);
      if (!users.length) {
        return res.status(404).json({ error: 'No account found with this email' });
      }

      const user = users[0];
      if (user.auth_restricted) {
        return res.status(403).json({ error: 'Your account has been restricted. Contact support for assistance.' });
      }

      userId = user.id;
      const passkeys = await query(
        'SELECT id, credential_id, transports FROM passkeys WHERE user_id = ?',
        [user.id]
      );

      if (!passkeys.length) {
        return res.status(404).json({ error: 'No passkeys registered for this account' });
      }

      allowCredentials = passkeys.map(k => ({
        id: k.credential_id,
        type: 'public-key',
        transports: k.transports ? k.transports.split(',') : ['internal'],
      }));
    }

    const { rpID } = getWebAuthnConfig(req);
    const options = await generateAuthenticationOptions({
      rpID,
      ...(allowCredentials ? { allowCredentials } : {}),
      userVerification: 'preferred',
    });

    const sessionToken = generateSessionToken();
    challengeMap.set(`login:${sessionToken}`, {
      challenge: options.challenge,
      timestamp: Date.now(),
      userId,
    });

    res.json({ options, userId, sessionToken });
  } catch (err) {
    console.error('Passkey login begin error:', err.message);
    res.status(500).json({ error: 'Failed to initiate passkey login' });
  }
});

router.post('/passkeys/login/complete', passkeyLoginLimiter, async (req, res) => {
  try {
    const { response, sessionToken } = req.body;
    if (!response) {
      return res.status(400).json({ error: 'Response is required' });
    }
    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token is required' });
    }

    const stored = challengeMap.get(`login:${sessionToken}`);
    if (!stored) {
      return res.status(400).json({ error: 'No login in progress. Please try again.' });
    }

    challengeMap.delete(`login:${sessionToken}`);

    const passkeys = await query(
      'SELECT id, credential_id, public_key, counter, transports, user_id FROM passkeys WHERE credential_id = ?',
      [response.id]
    );

    if (!passkeys.length) {
      return res.status(400).json({ error: 'Passkey not found' });
    }

    const passkey = passkeys[0];

    const { rpID, origin } = getWebAuthnConfig(req);
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: isoBase64URL.toBuffer(passkey.credential_id),
        publicKey: isoBase64URL.toBuffer(passkey.public_key),
        counter: passkey.counter,
        transports: passkey.transports ? passkey.transports.split(',') : ['internal'],
      },
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Passkey verification failed' });
    }

    await query('UPDATE passkeys SET counter = ? WHERE id = ?', [
      verification.authenticationInfo.newCounter,
      passkey.id,
    ]);

    const users = await query('SELECT id, email, username, ptero_user_id, is_admin, restricted, token_version FROM users WHERE id = ?', [passkey.user_id]);
    if (!users.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    const token = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      pteroId: user.ptero_user_id,
      isAdmin: !!user.is_admin,
      restricted: !!user.restricted,
      tokenVersion: user.token_version,
    });

    await logActivity(user.id, 'passkey_login', 'Logged in with a passkey');

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        pteroId: user.ptero_user_id,
        isAdmin: !!user.is_admin,
        restricted: !!user.restricted,
        gravatarHash: gravatarHash(user.email),
      },
    });
  } catch (err) {
    console.error('Passkey login complete error:', err.message);
    res.status(400).json({ error: 'Failed to complete passkey login' });
  }
});

router.get('/passkeys', authenticateToken, passkeyRegisterLimiter, async (req, res) => {
  try {
    const passkeys = await query(
      'SELECT id, name, transports, created_at FROM passkeys WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.userId]
    );

    res.json({ passkeys });
  } catch (err) {
    console.error('Passkey list error:', err.message);
    res.status(500).json({ error: 'Failed to list passkeys' });
  }
});

router.delete('/passkeys/:id', authenticateToken, passkeyRegisterLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid passkey ID' });
    }

    const passkeys = await query(
      'SELECT id FROM passkeys WHERE id = ? AND user_id = ?',
      [id, req.user.userId]
    );

    if (!passkeys.length) {
      return res.status(404).json({ error: 'Passkey not found' });
    }

    await query('DELETE FROM passkeys WHERE id = ?', [id]);
    await logActivity(req.user.userId, 'passkey_deleted', 'Deleted a passkey');

    res.json({ success: true });
  } catch (err) {
    console.error('Passkey delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete passkey' });
  }
});

setInterval(() => {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000;
  for (const [key, entry] of challengeMap) {
    if (now - entry.timestamp > maxAge) {
      challengeMap.delete(key);
    }
  }
}, 60000);

export default router;
