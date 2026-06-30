import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFile } from 'fs/promises';

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
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';
import { startScheduler } from './services/scheduler.js';
import { migrate } from './config/migrate.js';
import { query } from './config/db.js';
import { getRecentActivity } from './services/activity.js';

const app = express();

async function getPort() {
  try {
    const content = await readFile(resolve(__dirname, 'port.txt'), 'utf-8');
    return parseInt(content.trim(), 10) || 3000;
  } catch {
    return 3000;
  }
}

const PORT = process.env.PORT || await getPort();

const trustProxy = process.env.NODE_ENV === 'production';

app.set('trust proxy', trustProxy ? 1 : 0);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://panel.zero-host.org", "https://cap.zero-host.org", "https://cdn.jsdelivr.net"],
      workerSrc: ["'self'", "blob:"],
      frameSrc: ["https://cap.zero-host.org"],
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
  max: 20,
  message: { error: 'Too many attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: trustProxy ? 1 : 0,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: trustProxy ? 1 : 0,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/activity', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const result = await getRecentActivity(userId, limit, offset);
    res.json({
      activities: result.activities,
      total: result.total,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(result.total / limit) || 1,
      limit,
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('Activity route error:', err.message, err.stack?.split('\n')[1]);
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

app.get('/admin/*', (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
  process.exit(1);
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
