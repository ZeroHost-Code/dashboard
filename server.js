import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

const REQUIRED_ENV_VARS = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'CAP_SECRET', 'CAP_ENDPOINT', 'COOKIE_SECRET'];
const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

if (process.env.JWT_SECRET && /[\$\(\)]/.test(process.env.JWT_SECRET)) {
  console.error('JWT_SECRET contains unresolved shell expansion characters. Generate a proper random key.');
  process.exit(1);
}

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import crypto from 'crypto';

import authRoutes from './routes/auth.js';
import passkeyRoutes from './routes/passkeys.js';
import totpRoutes from './routes/totp.js';
import serverRoutes from './routes/servers.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { migrate } from './config/migrate.js';
import { query, closePool, getPoolStatus } from './config/db.js';
import { getRecentActivity } from './services/activity.js';
import { authenticateToken } from './middleware/auth.js';
import { ensureLogFile, writeLog } from './services/fileLogger.js';

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
const SHUTDOWN_TIMEOUT = parseInt(process.env.SHUTDOWN_TIMEOUT, 10) || 10000;

const trustProxy = process.env.NODE_ENV === 'production';

app.set('trust proxy', trustProxy ? 1 : 0);

app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    const ip = req.ip || req.socket.remoteAddress || '0.0.0.0';
    writeLog(req.method, req.path, ip);
  }
  next();
});

const activeRequests = new Map();

app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || '0.0.0.0';
  const count = (activeRequests.get(ip) || 0) + 1;
  if (count > 20) {
    return res.status(429).json({ error: 'Too many concurrent requests' });
  }
  activeRequests.set(ip, count);
  res.on('finish', () => {
    const c = activeRequests.get(ip);
    if (c && c <= 1) activeRequests.delete(ip);
    else if (c) activeRequests.set(ip, c - 1);
  });
  next();
});

app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    res.status(503).json({ error: 'Request timeout', requestId: req.requestId });
  });
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://static.cloudflareinsights.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://panel.zero-host.org", "https://cap.zero-host.org", "https://cdn.jsdelivr.net", "https://unpkg.com"],
      workerSrc: ["'self'", "blob:"],
      frameSrc: ["https://cap.zero-host.org"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
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
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/') && !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed', requestId: req.requestId });
  }
  next();
});

app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.path.startsWith('/api/')) {
    const ct = req.headers['content-type'] || '';
    if (!ct.startsWith('application/json') && !ct.startsWith('application/x-www-form-urlencoded') && !ct.startsWith('multipart/form-data')) {
      return res.status(415).json({ error: 'Unsupported content type. Use application/json.', requestId: req.requestId });
    }
  }
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    const host = req.headers['host'] || '';
    if (host && host !== 'localhost:3000' && !host.endsWith('.zero-host.org') && !host.endsWith('.vercel.app')) {
      if (process.env.NODE_ENV === 'production' && !host.endsWith('.zero-host.org')) {
        return res.status(403).json({ error: 'Invalid host header', requestId: req.requestId });
      }
    }
  }
  next();
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON in request body', requestId: req.requestId });
  }
  next();
});
app.use(cookieParser(process.env.COOKIE_SECRET));

const csrfExemptPaths = ['/api/auth/login', '/api/auth/register', '/api/auth/passkey/options', '/api/auth/passkey/verify', '/api/auth/passkeys/login/begin', '/api/auth/passkeys/login/complete', '/api/auth/passkeys/register/begin', '/api/auth/passkeys/register/complete', '/api/auth/totp/verify', '/api/auth/totp/recovery'];
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (csrfExemptPaths.includes(req.path)) return next();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const token = crypto.randomBytes(32).toString('hex');
    if (!req.cookies['XSRF-TOKEN']) {
      res.cookie('XSRF-TOKEN', token, {
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: false,
        maxAge: 24 * 60 * 60 * 1000,
      });
    }
    return next();
  }
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies['XSRF-TOKEN'];
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return res.status(403).json({ error: 'Invalid CSRF token', requestId: req.requestId });
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

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

const activityLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: trustProxy ? 1 : 0,
});

const staticLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: trustProxy ? 1 : 0,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/activity', activityLimiter);
app.use('/api/servers', apiLimiter);
app.use('/api', apiLimiter);

const userRateMap = new Map();
const USER_RATE_MAX = 200;
const USER_RATE_WINDOW = 60000;

app.use('/api', (req, res, next) => {
  const userId = req.user?.userId;
  if (!userId) return next();
  const now = Date.now();
  let entry = userRateMap.get(userId);
  if (!entry || now - entry.windowStart > USER_RATE_WINDOW) {
    entry = { count: 0, windowStart: now };
    userRateMap.set(userId, entry);
  }
  entry.count++;
  if (entry.count > USER_RATE_MAX) {
    return res.status(429).json({ error: 'User rate limit exceeded. Slow down.', requestId: req.requestId });
  }
  next();
});

setInterval(() => {
  const cutoff = Date.now() - USER_RATE_WINDOW;
  for (const [uid, entry] of userRateMap) {
    if (entry.windowStart < cutoff) userRateMap.delete(uid);
  }
}, 60000);

app.get('/api/config', (req, res) => {
  res.json({
    pteroUrl: process.env.PTERO_URL || '',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/auth', passkeyRoutes);
app.use('/api/auth', totpRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/activity', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

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
    console.error(`[${req.requestId}] Activity route error:`, err.message, err.stack?.split('\n')[1]);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    const poolStats = await getPoolStatus();
    const memUsage = process.memoryUsage();
    res.json({
      status: 'ok',
      db: 'connected',
      pool: poolStats,
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      },
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString(), requestId: req.requestId });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin/*', staticLimiter, (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', staticLimiter, (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', staticLimiter, (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, _next) => {
  console.error(`[${req.requestId}] Unhandled error:`, err);
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  res.status(err.status || 500).json({ error: message, requestId: req.requestId });
});

async function startServer() {
  await ensureLogFile();
  await migrate();
  const server = app.listen(PORT, () => {
    console.log(`ZeroHost Dashboard running on port ${PORT}`);
    startScheduler();
  });

  function shutdown(signal) {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    stopScheduler();
    server.close(() => {
      closePool();
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch(err => {
  console.error('Startup failed:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('warning', (warning) => {
  if (warning.name === 'MaxListenersExceededWarning') {
    console.error('Memory leak detected:', warning.message);
  }
});

setInterval(() => {
  const mem = process.memoryUsage();
  if (mem.heapUsed > 500 * 1024 * 1024) {
    console.error(`High memory usage warning: ${Math.round(mem.heapUsed / 1024 / 1024)}MB heap used`);
  }
}, 60000);


