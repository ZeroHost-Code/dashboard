import {
  getClientIp,
  isPrivateIp,
  normalizeIp,
  isBotUserAgent,
  isKnownBotIp,
  isIpSuspicious,
  checkHeaders,
  checkHoneypot,
  validateBrowserSignature,
  detectVpnProxy,
  checkSuspiciousQueryParams,
  checkBlockedCountry,
  checkConcurrentRequests,
  checkReferrer,
  checkBodySuspicious,
  checkIpBlacklists,
  calculateOverallRisk,
  recordFailedAction,
  isDisposableEmail,
  checkPasswordBreach,
  verifySubmitToken,
} from '../services/security.js';

const VPN_EXEMPT_PATHS = [
  '/api/config', '/api/health', '/api/activity',
];

const SENSITIVE_PATHS = [
  '/api/auth/register', '/api/auth/login', '/api/auth/change-password',
  '/api/auth/change-email', '/api/auth/delete-account',
  '/api/servers/create', '/api/admin/login',
];

export function advancedBotProtection() {
  return async (req, res, next) => {
    try {
      const ip = getClientIp(req);
      const ua = (req.headers['user-agent'] || '').toString().slice(0, 512);
      const isPost = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

      if (isIpSuspicious(ip) && isPost) {
        return res.status(403).json({ error: 'Access denied due to suspicious activity.', requestId: req.requestId });
      }

      const { allowed: concurrentOk } = checkConcurrentRequests(ip, 6);
      if (!concurrentOk && isPost) {
        return res.status(429).json({ error: 'Too many simultaneous requests.', requestId: req.requestId });
      }

      if (isBotUserAgent(ua) && isPost) {
        recordFailedAction(ip);
        return res.status(403).json({ error: 'Automated requests are not allowed.', requestId: req.requestId });
      }

      if (isKnownBotIp(ip) && isPost) {
        return res.status(403).json({ error: 'Access denied', requestId: req.requestId });
      }

      const { flagged: queryFlagged } = checkSuspiciousQueryParams(req);
      if (queryFlagged && isPost) {
        recordFailedAction(ip);
        return res.status(400).json({ error: 'Invalid request parameters', requestId: req.requestId });
      }

      const { triggered: honeypotTriggered } = checkHoneypot(req.body);
      if (honeypotTriggered && isPost) {
        recordFailedAction(ip);
        return res.status(400).json({ error: 'Invalid form submission', requestId: req.requestId });
      }

      const bodyCheck = checkBodySuspicious(req.body);
      if (bodyCheck.flagged && isPost) {
        recordFailedAction(ip);
        return res.status(400).json({ error: 'Request contains invalid content', requestId: req.requestId });
      }

      const fullPath = req.originalUrl || req.baseUrl + req.path;

      if (isPost && SENSITIVE_PATHS.includes(fullPath)) {
        const referrerCheck = checkReferrer(req);
        if (!referrerCheck.passed) {
          recordFailedAction(ip);
          return res.status(403).json({ error: 'Invalid request origin', requestId: req.requestId });
        }
      }

      if (isPost) {
        const risk = calculateOverallRisk(req);
        if (risk.level === 'high') {
          recordFailedAction(ip);
          return res.status(403).json({ error: 'Request blocked for security reasons', requestId: req.requestId });
        }
      }

      next();
    } catch (err) {
      console.error('[SECURITY] Middleware error:', err.message);
      next();
    }
  };
}

export function vpnProxyProtection() {
  return async (req, res, next) => {
    try {
      const fullPath = req.originalUrl || req.baseUrl + req.path;
      if (VPN_EXEMPT_PATHS.includes(fullPath)) return next();
      const ip = getClientIp(req);
      const cleanIp = normalizeIp(ip);
      if (!cleanIp || isPrivateIp(cleanIp)) return next();
      const isPost = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      if (!isPost) return next();
      const [vpnResult, blacklistResult] = await Promise.all([
        detectVpnProxy(cleanIp),
        fullPath.startsWith('/api/auth/') || fullPath.startsWith('/api/servers/') ? checkIpBlacklists(cleanIp) : { listed: false },
      ]);
      if (vpnResult.isVpn || vpnResult.isProxy || vpnResult.isTor) {
        recordFailedAction(ip);
        return res.status(403).json({
          error: vpnResult.isTor
            ? 'Tor network access is not allowed.'
            : 'VPN or proxy detected. Please disable your VPN for security reasons.',
          requestId: req.requestId,
        });
      }
      if (blacklistResult.listed) {
        recordFailedAction(ip);
        return res.status(403).json({
          error: 'Access denied. Your IP has been flagged.',
          requestId: req.requestId,
        });
      }
      next();
    } catch (err) {
      console.error('[SECURITY] VPN proxy middleware error:', err.message);
      next();
    }
  };
}

export function countryBlock() {
  return async (req, res, next) => {
    try {
      const fullPath = req.originalUrl || req.baseUrl + req.path;
      const isPost = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      if (!isPost) return next();
      if (fullPath === '/api/auth/login') return next();
      const ip = getClientIp(req);
      const { blocked, countryCode } = await checkBlockedCountry(ip);
      if (blocked) {
        recordFailedAction(ip);
        return res.status(403).json({ error: 'Service not available in your region.', requestId: req.requestId });
      }
      next();
    } catch (err) {
      console.error('[SECURITY] Country block middleware error:', err.message);
      next();
    }
  };
}

export function browserIntegrityCheck() {
  return (req, res, next) => {
    try {
      const isPost = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      if (!isPost) return next();
      const issues = checkHeaders(req);
      if (issues.length >= 3) {
        recordFailedAction(getClientIp(req));
        return res.status(403).json({ error: 'Invalid request headers. Please use a real browser.', requestId: req.requestId });
      }
      const signature = validateBrowserSignature(req);
      if (signature.total < 30 && issues.length > 0) {
        recordFailedAction(getClientIp(req));
        return res.status(403).json({ error: 'Browser verification failed. Please use a modern browser.', requestId: req.requestId });
      }
      next();
    } catch (err) {
      console.error('[SECURITY] Browser integrity error:', err.message);
      next();
    }
  };
}

export function disposableEmailCheck() {
  return async (req, res, next) => {
    try {
      const email = req.body?.email;
      if (!email || typeof email !== 'string') return next();
      if (await isDisposableEmail(email)) {
        return res.status(403).json({ error: 'Temporary email addresses are not allowed.', requestId: req.requestId });
      }
      next();
    } catch (err) {
      console.error('[SECURITY] Disposable email check error:', err.message);
      next();
    }
  };
}

export function passwordBreachCheck() {
  return async (req, res, next) => {
    try {
      if (!req.originalUrl.startsWith('/api/')) return next();
      const password = req.body?.password || req.body?.newPassword;
      if (!password || typeof password !== 'string') return next();
      if (password.length < 6) return next();
      const { breached } = await checkPasswordBreach(password);
      if (breached) {
        return res.status(400).json({
          error: 'This password has been exposed in a data breach. Please choose a different password.',
          requestId: req.requestId,
        });
      }
      next();
    } catch (err) {
      console.error('[SECURITY] Password breach check error:', err.message);
      next();
    }
  };
}

export function securityAudit(action) {
  return async (req, res, next) => {
    const ip = getClientIp(req);
    const origJson = res.json.bind(res);
    res.json = function (body) {
      if (res.statusCode >= 400) {
        recordFailedAction(ip, action.includes('login') ? 'login' : 'action');
      }
      return origJson(body);
    };
    next();
  };
}
