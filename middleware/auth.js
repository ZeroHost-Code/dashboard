import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET;

async function getUserById(userId) {
  try {
    const rows = await query(
      'SELECT id, email, username, is_admin, restricted, auth_restricted, token_version, ptero_user_id FROM users WHERE id = ?',
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function authenticateToken(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(decoded.userId);

    if (!user) {
      return res.status(403).json({ error: 'User no longer exists' });
    }

    if (user.auth_restricted) {
      return res.status(403).json({ error: 'Your account has been restricted. Contact support for assistance.' });
    }

    if (user.token_version !== decoded.tokenVersion) {
      return res.status(403).json({ error: 'Session expired. Please log in again.' });
    }

    req.user = {
      userId: user.id,
      email: user.email,
      username: user.username,
      pteroId: user.ptero_user_id,
      isAdmin: !!user.is_admin,
      restricted: !!user.restricted,
      tokenVersion: user.token_version,
    };

    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function requireNotRestricted(req, res, next) {
  if (req.user?.restricted) {
    return res.status(403).json({ error: 'Your account is restricted. This action is disabled.' });
  }
  next();
}

export function requireOwnership(table, column, paramName, idSource = 'params') {
  return async (req, res, next) => {
    try {
      const id = parseInt(idSource === 'params' ? req.params[paramName] : req.body[paramName], 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID' });
      }

      const rows = await query(`SELECT user_id FROM ${table} WHERE ${column} = ?`, [id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      if (rows[0].user_id !== req.user.userId) {
        return res.status(403).json({ error: 'Access denied. Resource does not belong to you.' });
      }

      next();
    } catch (err) {
      console.error('Ownership check error:', err.message);
      res.status(500).json({ error: 'Ownership verification failed' });
    }
  };
}

export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    algorithm: 'HS256',
  });
}
