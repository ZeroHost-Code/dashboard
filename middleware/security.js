import {
  getClientIp,
  isPrivateIp,
  normalizeIp,
  isBotUserAgent,
  isKnownBotIp,
  checkHeaders,
  checkHoneypot,
  validateBrowserSignature,
  detectVpnProxy,
  checkSuspiciousQueryParams,
  checkBlockedCountry,
  checkConcurrentRequests,
  validateRequestTiming,
} from '../services/security.js';

const BLOCKED_COUNTRIES = new Set(['CN', 'RU', 'KP', 'IR', 'SY', 'CU', 'VE']);

const TIMING_EXEMPT_PATHS = [
  '/api/config', '/api/health', '/api/auth/passkeys/login/begin',
  '/api/auth/passkeys/login/complete', '/api/auth/passkeys/register/begin',
  '/api/auth/passkeys/register/complete', '/api/auth/totp/verify',
  '/api/auth/totp/recovery', '/api/auth/check-availability',
  '/api/auth/check-vpn',
];

const VPN_EXEMPT_PATHS = [
  '/api/config', '/api/health', '/api/activity',
];

const SUSPICIOUS_IPS = new Set();

export function advancedBotProtection(required = false) {
  return async (req, res, next) => {
    try {
      if (!req.path.startsWith('/api/')) return next();
      const ip = getClientIp(req);
      const ua = (req.headers['user-agent'] || '').toString().slice(0, 512);
      const method = req.method;
      const isPost = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

      if (SUSPICIOUS_IPS.has(ip)) {
        const attempts = SUSPICIOUS_IPS.get(ip);
        if (attempts >= 3) {
          return res.status(403).json({ error: 'Access denied', requestId: req.requestId });
        }
      }

      const { allowed: concurrentOk, count: concurrentCount } = checkConcurrentRequests(ip, 8);
      if (!concurrentOk && isPost) {
        return res.status(429).json({ error: 'Too many simultaneous requests. Slow down.', requestId: req.requestId });
      }

      if (isBotUserAgent(ua) && isPost) {
        SUSPICIOUS_IPS.set(ip, (SUSPICIOUS_IPS.get(ip) || 0) + 1);
        return res.status(403).json({ error: 'Automated requests are not allowed. Please use a real browser.', requestId: req.requestId });
      }

      if (isKnownBotIp(ip) && isPost) {
        return res.status(403).json({ error: 'Access denied', requestId: req.requestId });
      }

      const { flagged: queryFlagged, param, pattern } = checkSuspiciousQueryParams(req);
      if (queryFlagged && isPost) {
        console.warn(`[SECURITY] Suspicious query param "${param}" containing "${pattern}" from IP ${ip}`);
        return res.status(400).json({ error: 'Invalid request parameters', requestId: req.requestId });
      }

      const { triggered: honeypotTriggered, field: honeypotField } = checkHoneypot(req.body);
      if (honeypotTriggered && isPost) {
        console.warn(`[SECURITY] Honeypot triggered on field "${honeypotField}" from IP ${ip}`);
        return res.status(400).json({ error: 'Invalid form submission', requestId: req.requestId });
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
      if (!req.path.startsWith('/api/')) return next();
      if (VPN_EXEMPT_PATHS.includes(req.path)) return next();
      const ip = getClientIp(req);
      const cleanIp = normalizeIp(ip);
      if (!cleanIp || isPrivateIp(cleanIp)) return next();
      const isPost = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      if (!isPost) return next();
      const result = await detectVpnProxy(cleanIp);
      if (result.isVpn || result.isProxy || result.isTor) {
        const source = result.source || 'unknown';
        console.warn(`[SECURITY] VPN/Proxy/Tor detected for IP ${cleanIp} (source: ${source})`);
        return res.status(403).json({
          error: result.isTor
            ? 'Tor network access is not allowed.'
            : 'VPN or proxy detected. Please disable your VPN for security reasons.',
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
      if (!req.path.startsWith('/api/')) return next();
      const isPost = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      if (!isPost) return next();
      if (req.path === '/api/auth/login') return next();
      const ip = getClientIp(req);
      const { blocked, countryCode } = await checkBlockedCountry(ip);
      if (blocked) {
        console.warn(`[SECURITY] Blocked request from ${countryCode} IP ${ip}`);
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
      if (!req.path.startsWith('/api/')) return next();
      const isPost = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      if (!isPost) return next();
      const issues = checkHeaders(req);
      if (issues.length >= 3) {
        const ip = getClientIp(req);
        console.warn(`[SECURITY] Browser integrity check failed for IP ${ip}: ${issues.join(', ')}`);
        return res.status(403).json({ error: 'Invalid request headers. Please use a real browser.', requestId: req.requestId });
      }
      const signature = validateBrowserSignature(req);
      if (!signature.passed && issues.length > 0) {
        const ip = getClientIp(req);
        console.warn(`[SECURITY] Low browser signature score ${signature.total}/100 for IP ${ip}`);
      }
      next();
    } catch (err) {
      console.error('[SECURITY] Browser integrity error:', err.message);
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
        console.warn(`[AUDIT] ${action} failed for IP ${ip}: ${JSON.stringify(body)}`);
      }
      return origJson(body);
    };
    next();
  };
}
