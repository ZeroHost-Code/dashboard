import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('Missing JWT_SECRET environment variable');
} else if (/[\$\(\)]/.test(JWT_SECRET)) {
  console.error('JWT_SECRET contains unresolved shell expansion characters ($(), backticks). Generate a proper random key (e.g. openssl rand -hex 32) and hardcode it in .env');
}

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    if (decoded.tokenVersion !== undefined) {
      try {
        const rows = await query('SELECT token_version FROM users WHERE id = ?', [decoded.userId]);
        if (rows.length > 0 && rows[0].token_version !== decoded.tokenVersion) {
          return res.status(403).json({ error: 'Session expired. Please log in again.' });
        }
      } catch {
        return res.status(403).json({ error: 'Session validation failed.' });
      }
    }

    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    algorithm: 'HS256',
  });
}
