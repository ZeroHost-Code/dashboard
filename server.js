import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import path from 'path';

import authRoutes from './routes/auth.js';
import serverRoutes from './routes/servers.js';
import { startScheduler } from './services/scheduler.js';
import { migrate } from './config/migrate.js';
import { query } from './config/db.js';
import { getRecentActivity } from './services/activity.js';

const app = express();
let portFromFile = 3000;
try { portFromFile = parseInt(readFileSync(resolve(__dirname, 'port.txt'), 'utf-8').trim(), 10) || 3000; } catch {}
const PORT = process.env.PORT || portFromFile;

const trustProxy = process.env.NODE_ENV === 'production';

app.set('trust proxy', trustProxy ? 1 : 0);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://pagead2.googlesyndication.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://panel.zero-host.org", "https://cap.zero-host.org", "https://pagead2.googlesyndication.com", "https://cdn.jsdelivr.net"],
      workerSrc: ["'self'", "blob:"],
      frameSrc: ["https://cap.zero-host.org", "https://googleads.g.doubleclick.net"],
      objectSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
  noSniff: true,
  hidePoweredBy: true,
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://dashboard.zero-host.org', 'https://zero-host.org']
    : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  trustLevel: trustProxy ? 1 : 0,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
  trustLevel: trustProxy ? 1 : 0,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);

app.get('/api/activity', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const activities = await getRecentActivity(userId);
    res.json({ activities });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('Activity route error:', err.message);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

migrate().then(() => {
  app.listen(PORT, () => {
    console.log(`ZeroHost Dashboard running on port ${PORT}`);
    startScheduler();
  });
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
