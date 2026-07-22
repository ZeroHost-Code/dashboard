import { isIP } from 'net';
import dns from 'dns';
import { randomBytes } from 'crypto';
import { resolve } from 'path';
import { readFile } from 'fs/promises';

const dnsResolver = new dns.promises.Resolver({ timeout: 3000, tries: 1 });
dnsResolver.setServers(['1.1.1.1', '8.8.8.8']);

const DISPOSABLE_DOMAINS_URL = 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf';
const LOCAL_DISPOSABLE_DOMAINS = new Set([
  'ztzt.net',
  'besteya.com',
]);
let disposableDomainsCache = null;
let disposableDomainsTimestamp = 0;
const DOMAINS_CACHE_TTL = 3600000;

async function loadDisposableDomains() {
  if (disposableDomainsCache && (Date.now() - disposableDomainsTimestamp < DOMAINS_CACHE_TTL)) {
    return disposableDomainsCache;
  }
  const merged = new Set(LOCAL_DISPOSABLE_DOMAINS);
  try {
    const res = await fetchWithTimeout(DISPOSABLE_DOMAINS_URL, {}, 10000);
    const text = await res.text();
    for (const line of text.split('\n')) {
      const domain = line.trim().toLowerCase();
      if (domain) merged.add(domain);
    }
  } catch {}
  disposableDomainsCache = merged;
  disposableDomainsTimestamp = Date.now();
  return disposableDomainsCache;
}

export async function isDisposableEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1].toLowerCase().trim();
  const domains = await loadDisposableDomains();
  return domains.has(domain) || [...domains].some(d => domain.endsWith('.' + d));
}

export async function checkPasswordBreach(password) {
  if (!password || password.length < 6) return { breached: false };
  try {
    const encoded = new TextEncoder().encode(password);
    const buf = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    const view = new Uint8Array(buf);
    const hex = Array.from(view).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const prefix = hex.slice(0, 5);
    const suffix = hex.slice(5);
    const res = await fetchWithTimeout(`https://api.pwnedpasswords.com/range/${prefix}`, {}, 5000);
    const text = await res.text();
    const found = text.split('\n').some(line => {
      const [hashSuffix] = line.split(':');
      return hashSuffix === suffix;
    });
    return { breached: found };
  } catch {
    return { breached: false };
  }
}

export function generateSubmitToken() {
  const token = randomBytes(32).toString('hex');
  return token;
}

const submitTokens = new Map();
const SUBMIT_TOKEN_TTL = 300000;

setInterval(() => {
  const cutoff = Date.now() - SUBMIT_TOKEN_TTL;
  for (const [token, entry] of submitTokens) {
    if (entry.timestamp < cutoff) submitTokens.delete(token);
  }
}, 60000);

export function createSubmitToken() {
  const token = generateSubmitToken();
  submitTokens.set(token, { timestamp: Date.now(), used: false });
  return token;
}

export function verifySubmitToken(token) {
  if (!token || typeof token !== 'string') return false;
  const entry = submitTokens.get(token);
  if (!entry) return false;
  if (entry.used) return false;
  if (Date.now() - entry.timestamp > SUBMIT_TOKEN_TTL) {
    submitTokens.delete(token);
    return false;
  }
  entry.used = true;
  submitTokens.delete(token);
  return true;
}

const DNSBL_LIST = [
  'zen.spamhaus.org',
  'dnsbl.dronebl.org',
  'bl.spamcop.net',
  'bogons.cymru.com',
  'cbl.abuseat.org',
  'dnsbl.sorbs.net',
  'tor.dan.me.uk',
  'rbl.efnetrbl.org',
  'rbl.schulte.org',
  'dnsbl-1.uceprotect.net',
];

async function checkDnsbl(ip, dnsbl) {
  try {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    const octets = parts.map(Number);
    if (octets.some(o => isNaN(o) || o < 0 || o > 255)) return false;
    if (octets[0] === 10) return false;
    if (octets[0] === 127) return false;
    if (octets[0] === 169 && octets[1] === 254) return false;
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;
    if (octets[0] === 192 && octets[1] === 168) return false;
    const reverseHost = `${octets[3]}.${octets[2]}.${octets[1]}.${octets[0]}.${dnsbl}`;
    const addresses = await dnsResolver.resolve4(reverseHost);
    return addresses.some(addr => addr.startsWith('127.'));
  } catch {
    return false;
  }
}

const DNSBL_CACHE = new Map();
const DNSBL_CACHE_TTL = 600000;

export async function checkIpBlacklists(ip) {
  const cleanIp = normalizeIp(ip);
  if (!cleanIp || isPrivateIp(cleanIp)) return { listed: false, blacklists: [] };
  const cached = DNSBL_CACHE.get(cleanIp);
  if (cached && (Date.now() - cached.timestamp < DNSBL_CACHE_TTL)) return cached.result;
  const listedBlacklists = [];
  for (const dnsbl of DNSBL_LIST) {
    try {
      if (await checkDnsbl(cleanIp, dnsbl)) {
        listedBlacklists.push(dnsbl);
      }
    } catch {}
  }
  const result = { listed: listedBlacklists.length > 0, blacklists: listedBlacklists };
  DNSBL_CACHE.set(cleanIp, { result, timestamp: Date.now() });
  return result;
}

setInterval(() => {
  const cutoff = Date.now() - DNSBL_CACHE_TTL;
  for (const [ip, entry] of DNSBL_CACHE) {
    if (entry.timestamp < cutoff) DNSBL_CACHE.delete(ip);
  }
}, 300000);

export function checkReferrer(req) {
  const referer = req.headers['referer'] || req.headers['referrer'] || '';
  if (!referer) return { passed: false, reason: 'missing_referrer' };
  try {
    const url = new URL(referer);
    const validHosts = process.env.NODE_ENV === 'production'
      ? ['dashboard.zero-host.org', 'zero-host.org']
      : ['localhost:3000', '127.0.0.1:3000'];
    if (validHosts.some(h => url.host === h || url.host.endsWith('.' + h))) {
      return { passed: true, host: url.host };
    }
    return { passed: false, reason: 'invalid_referrer', host: url.host };
  } catch {
    return { passed: false, reason: 'invalid_url' };
  }
}

export function checkBodySuspicious(body) {
  if (!body || typeof body !== 'object') return { flagged: false };
  const suspiciousPatterns = [
    /<script[\s>]/i, /javascript:/i, /onerror\s*=/i,
    /onload\s*=/i, /onclick\s*=/i, /onmouseover\s*=/i,
    /vbscript:/i, /data:\s*text\/html/i,
    /&#x?\d+;/i, /\\u00[0-9a-f]{2}/i,
    /<\s*iframe/i, /<\s*embed/i, /<\s*object/i,
    /alert\s*\(/i, /prompt\s*\(/i, /confirm\s*\(/i,
    /document\.cookie/i, /window\.location/i,
    /base64,/i, /fromCharCode/i,
  ];
  const strBody = JSON.stringify(body);
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(strBody)) return { flagged: true, pattern: pattern.source };
  }
  return { flagged: false };
}

const CLOUD_PROVIDER_ASNS = new Set([
  'AS16509', 'AS39111', 'AS45102', 'AS16276', 'AS36351', 'AS13335',
  'AS14618', 'AS16509', 'AS20115', 'AS16509', 'AS14618', 'AS8987',
  'AS26496', 'AS30083', 'AS40065', 'AS46690', 'AS29791', 'AS36492',
  'AS55095', 'AS55059', 'AS13876', 'AS20326', 'AS21342', 'AS22385',
  'AS36352', 'AS20473', 'AS62567', 'AS32780', 'AS394906', 'AS54203',
  'AS53363', 'AS11878', 'AS14061', 'AS46664', 'AS147008', 'AS199524',
  'AS396982', 'AS63949', 'AS60068', 'AS55286', 'AS20454', 'AS53869',
  'AS19551', 'AS8455', 'AS29073', 'AS16302', 'AS21277', 'AS49333',
  'AS58057', 'AS59441', 'AS206264', 'AS61138',
]);

const BOT_UA_PATTERNS = [
  /curl\//i, /wget\//i, /node-fetch/i, /python-requests/i,
  /python-httpx/i, /urllib/i, /aiohttp/i, /go-http-client/i,
  /java\/\d+/i, /libcurl/i, /okhttp/i, /httpie/i,
  /postmanruntime/i, /insomnia/i, /axios\//i, /fetch\//i,
  /ruby\//i, /perl\//i, /php\/\d+/i, /nethttp/i, /http-client/i,
  /scrapy/i, /python-urllib/i, /robot/i, /spider/i, /crawler/i,
  /masscan/i, /nmap/i, /zgrab/i, /fscan/i, /pure-native/i,
  /fasthttp/i, /restsharp/i, /datadog/i, /newrelic/i,
  /ahc\//i, /async-http/i, /lwp::simple/i, /www-mechanize/i,
  /python-requests\/\d/i, /httpx/i, /httplib2/i,
  /selenium/i, /puppeteer/i, /playwright/i, /cypress/i,
  /headless/i, /phantomjs/i, /nightmare/i,
  /Mozilla\/5\.0\s*$/i, /Mozilla\/4\.0\s*$/i,
  /^$/, /^-$/,
];

const REQUIRED_BROWSER_HEADERS = {
  'accept': /^text\/html|application\/json|\*\/\*/,
  'accept-language': /^[a-z]{2}(-[A-Z]{2})?(,[a-z]{2}(-[A-Z]{2})?)*$/,
  'sec-fetch-site': /^(none|same-origin|same-site|cross-site)$/,
  'sec-fetch-mode': /^(navigate|same-origin|cors|no-cors)$/,
  'sec-fetch-dest': /^(document|empty|iframe|script)$/,
};

const FOUR_SECONDS = 4000;

const behaviorScores = new Map();
const BEHAVIOR_TTL = 3600000;
const SUSPICIOUS_IPS = new Map();
const SUSPICIOUS_TTL = 86400000;

function getIpBehavior(ip) {
  const cleanIp = normalizeIp(ip);
  if (!cleanIp) return null;
  let entry = behaviorScores.get(cleanIp);
  if (!entry) {
    entry = { score: 0, failedLogins: 0, failedRegistrations: 0, failedActions: 0, firstSeen: Date.now(), lastSeen: Date.now() };
    behaviorScores.set(cleanIp, entry);
  }
  entry.lastSeen = Date.now();
  return entry;
}

export function recordFailedAction(ip, type = 'action') {
  const entry = getIpBehavior(ip);
  if (!entry) return;
  entry.score = Math.min(100, entry.score + 15);
  entry.failedActions++;
  if (type === 'login') entry.failedLogins++;
  if (type === 'register') entry.failedRegistrations++;
  if (entry.score >= 80) {
    SUSPICIOUS_IPS.set(normalizeIp(ip), { timestamp: Date.now(), reason: 'high_failure_rate' });
  }
}

export function recordSuccessfulAction(ip) {
  const entry = getIpBehavior(ip);
  if (!entry) return;
  entry.score = Math.max(0, entry.score - 5);
}

export function isIpSuspicious(ip) {
  const cleanIp = normalizeIp(ip);
  if (!cleanIp) return false;
  if (SUSPICIOUS_IPS.has(cleanIp)) return true;
  const entry = behaviorScores.get(cleanIp);
  if (entry && entry.score >= 80) return true;
  return false;
}

export function getBehaviorScore(ip) {
  const cleanIp = normalizeIp(ip);
  if (!cleanIp) return null;
  const entry = behaviorScores.get(cleanIp);
  return entry ? { score: entry.score, failedLogins: entry.failedLogins, failedActions: entry.failedActions, firstSeen: entry.firstSeen } : null;
}

export function calculateOverallRisk(req) {
  let risk = 0;
  const reasons = [];
  const ip = getClientIp(req);
  const ua = (req.headers['user-agent'] || '').toString().slice(0, 512);
  if (isBotUserAgent(ua)) { risk += 30; reasons.push('bot_ua'); }
  const issues = checkHeaders(req);
  if (issues.length >= 2) { risk += 15; reasons.push('bad_headers'); }
  if (issues.length >= 4) { risk += 10; reasons.push('very_bad_headers'); }
  const cleanIp = normalizeIp(ip);
  if (cleanIp && isPrivateIp(cleanIp)) { risk += 5; reasons.push('private_ip'); }
  if (cleanIp && isKnownBotIp(cleanIp)) { risk += 25; reasons.push('known_bot_ip'); }
  if (cleanIp && isIpSuspicious(cleanIp)) { risk += 20; reasons.push('suspicious_ip'); }
  if (cleanIp) {
    const behavior = behaviorScores.get(cleanIp);
    if (behavior) risk += Math.min(20, behavior.score / 5);
  }
  const accept = req.headers['accept'] || '';
  if (!accept || accept === '*/*') { risk += 10; reasons.push('generic_accept'); }
  const encoding = req.headers['accept-encoding'] || '';
  if (!encoding) { risk += 5; reasons.push('no_encoding'); }
  const referer = req.headers['referer'] || '';
  if (!referer && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const fullPath = req.originalUrl || req.baseUrl + req.path;
    if (fullPath.startsWith('/api/') && !fullPath.includes('/auth/login') && !fullPath.includes('/auth/register')) {
      risk += 10; reasons.push('no_referrer');
    }
  }
  const bodyFlag = checkBodySuspicious(req.body);
  if (bodyFlag.flagged) { risk += 30; reasons.push('suspicious_body'); }
  return { risk: Math.min(100, risk), reasons, level: risk >= 60 ? 'high' : risk >= 30 ? 'medium' : 'low' };
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || '0.0.0.0';
}

export function isPrivateIp(ip) {
  const clean = typeof ip === 'string' ? ip.replace(/^::ffff:/, '') : '';
  if (!clean || !isIP(clean)) return false;
  if (clean === '127.0.0.1' || clean === '::1' || clean === '0.0.0.0') return true;
  if (clean.startsWith('192.168.') || clean.startsWith('10.') || clean.startsWith('172.16.')) return true;
  if (/^f[cde][0-9a-f]{2}:/i.test(clean)) return true;
  if (clean.startsWith('169.254.')) return true;
  return false;
}

export function normalizeIp(ip) {
  if (typeof ip !== 'string') return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^::ffff:/, '');
}

export function checkHeaders(req) {
  const issues = [];
  if (!req.headers['accept']) issues.push('missing_accept');
  if (!req.headers['accept-language']) issues.push('missing_accept_language');
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  if (!ua) issues.push('missing_ua');
  if (ua.length > 0 && ua.length < 20) issues.push('short_ua');
  if (ua === 'mozilla/5.0') issues.push('generic_ua');
  if (!req.headers['sec-ch-ua'] && !req.headers['sec-ch-ua-mobile']) {
    if (!ua.includes('headless') && !ua.includes('bot')) {
      issues.push('missing_sec_ch_ua');
    }
  }
  return issues;
}

export function isBotUserAgent(ua) {
  if (!ua || typeof ua !== 'string') return true;
  const clean = ua.toString().slice(0, 512);
  if (clean.length < 10) return true;
  if (clean === 'Mozilla/5.0' || clean === 'Mozilla/4.0') return true;
  for (const pattern of BOT_UA_PATTERNS) {
    if (pattern.test(clean)) return true;
  }
  return false;
}

export function isKnownBotIp(ip) {
  const clean = typeof ip === 'string' ? ip.replace(/^::ffff:/, '') : '';
  if (!clean || !isIP(clean)) return false;
  const parts = clean.split('.').map(Number);
  if (parts.length !== 4) return false;
  if (parts[0] === 45 && parts[1] === 8) return true;
  if (parts[0] === 45 && parts[1] === 14) return true;
  if (parts[0] === 45 && parts[1] === 15) return true;
  if (parts[0] === 45 && parts[1] === 33) return true;
  if (parts[0] === 45 && parts[1] === 40) return true;
  if (parts[0] === 45 && parts[1] === 62) return true;
  if (parts[0] === 45 && parts[1] === 64) return true;
  if (parts[0] === 45 && parts[1] === 79) return true;
  if (parts[0] === 45 && parts[1] === 80) return true;
  if (parts[0] === 45 && parts[1] === 83) return true;
  if (parts[0] === 45 && parts[1] === 88) return true;
  if (parts[0] === 45 && parts[1] === 91) return true;
  if (parts[0] === 45 && parts[1] === 94) return true;
  if (parts[0] === 45 && parts[1] === 128) return true;
  if (parts[0] === 45 && parts[1] === 135) return true;
  if (parts[0] === 45 && parts[1] === 143) return true;
  if (parts[0] === 45 && parts[1] === 148) return true;
  if (parts[0] === 45 && parts[1] === 150) return true;
  if (parts[0] === 45 && parts[1] === 152) return true;
  if (parts[0] === 45 && parts[1] === 153) return true;
  if (parts[0] === 45 && parts[1] === 155) return true;
  return false;
}

export function checkHoneypot(body) {
  if (!body || typeof body !== 'object') return { triggered: false };
  const honeypotFields = ['website', 'url', 'homepage', 'message2', 'confirm_email', 'fax', 'phone2'];
  for (const field of honeypotFields) {
    if (body[field] !== undefined && body[field] !== '' && body[field] !== null) {
      return { triggered: true, field };
    }
  }
  return { triggered: false };
}

export function validateBrowserSignature(req) {
  const score = { total: 0, checks: [] };
  const accept = req.headers['accept'] || '';
  if (/text\/html|application\/json|\*\/\*/.test(accept)) {
    score.total += 10;
    score.checks.push('accept_pass');
  } else {
    score.checks.push('accept_suspicious');
  }
  const lang = req.headers['accept-language'] || '';
  if (/^[a-z]{2}(-[A-Z]{2})?(,[a-z]{2}(-[A-Z]{2})?)*$/.test(lang)) {
    score.total += 10;
    score.checks.push('lang_pass');
  } else {
    score.checks.push('lang_suspicious');
  }
  const fetchSite = req.headers['sec-fetch-site'] || '';
  if (fetchSite && /^(none|same-origin|same-site|cross-site)$/.test(fetchSite)) {
    score.total += 15;
    score.checks.push('sec_fetch_site_pass');
  }
  const fetchMode = req.headers['sec-fetch-mode'] || '';
  if (fetchMode && /^(navigate|same-origin|cors|no-cors)$/.test(fetchMode)) {
    score.total += 15;
    score.checks.push('sec_fetch_mode_pass');
  }
  const fetchDest = req.headers['sec-fetch-dest'] || '';
  if (fetchDest && /^(document|empty|iframe|script)$/.test(fetchDest)) {
    score.total += 15;
    score.checks.push('sec_fetch_dest_pass');
  }
  const secChUa = req.headers['sec-ch-ua'] || '';
  if (secChUa) {
    score.total += 15;
    score.checks.push('sec_ch_ua_pass');
  }
  const dnt = req.headers['dnt'] || req.headers['sec-gpc'] || '';
  if (dnt) {
    score.total += 5;
    score.checks.push('dnt_pass');
  }
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  if (ua.includes('windows') || ua.includes('mac') || ua.includes('linux') || ua.includes('android') || ua.includes('ios') || ua.includes('iphone') || ua.includes('like mac')) {
    score.total += 15;
    score.checks.push('os_pass');
  }
  score.passed = score.total >= 60;
  return score;
}

export function validateRequestTiming(req) {
  const timing = req.headers['x-request-start'] || req.headers['x-timing'] || req.query._t || '';
  if (!timing) return { passed: false, reason: 'no_timing' };
  const startTime = parseInt(timing.toString(), 10);
  if (isNaN(startTime) || startTime <= 0) return { passed: false, reason: 'invalid_timing' };
  const elapsed = Date.now() - startTime;
  if (elapsed < FOUR_SECONDS) return { passed: false, reason: 'too_fast' };
  return { passed: true, elapsed };
}

const CACHE_DURATION = 15 * 60 * 1000;
const VPN_CACHE = new Map();
const ASN_CACHE = new Map();

setInterval(() => {
  const cutoff = Date.now() - CACHE_DURATION;
  for (const [key, entry] of VPN_CACHE) {
    if (entry.timestamp < cutoff) VPN_CACHE.delete(key);
  }
  for (const [key, entry] of ASN_CACHE) {
    if (entry.timestamp < cutoff) ASN_CACHE.delete(key);
  }
}, 5 * 60 * 1000);

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function detectVpnProxy(ip) {
  const cleanIp = normalizeIp(ip);
  if (!cleanIp || isPrivateIp(cleanIp)) return { isVpn: false, isProxy: false, source: 'private' };
  const cached = VPN_CACHE.get(cleanIp);
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    return cached.result;
  }
  let result = { isVpn: false, isProxy: false, source: 'none' };
  let asn = null;
  try {
    const res = await fetchWithTimeout(`http://ip-api.com/json/${encodeURIComponent(cleanIp)}?fields=proxy,hosting,isp,org,as,query`);
    const data = await res.json();
    if (data.proxy === true || data.hosting === true) {
      result = { isVpn: true, isProxy: data.proxy === true, source: 'ip-api' };
    }
    asn = data.as || null;
    if (asn && CLOUD_PROVIDER_ASNS.has(asn)) {
      result = { isVpn: true, isProxy: true, source: 'asn', asn };
    }
  } catch {}
  if (asn) {
    ASN_CACHE.set(cleanIp, { asn, timestamp: Date.now() });
  }
  if (!result.isVpn) {
    try {
      const res = await fetchWithTimeout(`https://ipinfo.io/${encodeURIComponent(cleanIp)}/json`);
      const data = await res.json();
      const org = (data.org || '').toLowerCase();
      if (org.includes('vpn') || org.includes('proxy') || org.includes('tor') || org.includes('datacenter') || org.includes('cloud') || org.includes('hosting')) {
        result = { isVpn: true, isProxy: true, source: 'ipinfo' };
      }
      if (!asn && data.asn) {
        const asnCode = data.asn.split(' ')[0];
        if (CLOUD_PROVIDER_ASNS.has(asnCode)) {
          result = { isVpn: true, isProxy: true, source: 'asn', asn: asnCode };
        }
      }
    } catch {}
  }
  if (!result.isVpn) {
    try {
      const res = await fetchWithTimeout(`https://vpnapi.io/api/${encodeURIComponent(cleanIp)}`);
      const data = await res.json();
      if (data.security && (data.security.vpn || data.security.proxy || data.security.tor)) {
        result = { isVpn: !!data.security.vpn, isProxy: !!data.security.proxy, isTor: !!data.security.tor, source: 'vpnapi' };
      }
    } catch {}
  }
  if (!result.isVpn) {
    try {
      const torDnsbl = await resolveTorDnsbl(cleanIp);
      if (torDnsbl) {
        result = { isVpn: true, isTor: true, source: 'dnsbl' };
      }
    } catch {}
  }
  VPN_CACHE.set(cleanIp, { result, timestamp: Date.now() });
  return result;
}

async function resolveTorDnsbl(ip) {
  try {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    const octets = parts.map(Number);
    if (octets.some(o => isNaN(o) || o < 0 || o > 255)) return false;
    if (octets[0] === 10) return false;
    if (octets[0] === 127) return false;
    if (octets[0] === 169 && octets[1] === 254) return false;
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;
    if (octets[0] === 192 && octets[1] === 168) return false;
    const reverseHost = `${octets[3]}.${octets[2]}.${octets[1]}.${octets[0]}.tor.dan.me.uk`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`http://${reverseHost}`, {
        signal: controller.signal,
        headers: { 'Accept': 'text/plain' },
      });
      return res.status === 127;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export function checkSuspiciousQueryParams(req) {
  const query = req.query || {};
  const suspicious = ['debug', 'test', 'bypass', 'admin', 'sudo', 'cmd', 'exec', 'command', 'eval', 'system', 'shell', 'sql', 'union', 'select', 'from', 'where', 'drop', 'alter', 'create', 'insert', 'delete', 'update', '../', '..\\', '%00', '<script', '<?php'];
  for (const key of Object.keys(query)) {
    const val = String(query[key]).toLowerCase();
    for (const s of suspicious) {
      if (val.includes(s)) return { flagged: true, param: key, pattern: s };
    }
  }
  return { flagged: false };
}

const COUNTRY_BLOCKLIST = new Set(['CN', 'RU', 'KP', 'IR', 'SY', 'CU', 'VE']);

export async function checkBlockedCountry(ip) {
  const cleanIp = normalizeIp(ip);
  if (!cleanIp || isPrivateIp(cleanIp)) return { blocked: false };
  try {
    const res = await fetchWithTimeout(`http://ip-api.com/json/${encodeURIComponent(cleanIp)}?fields=countryCode`, {}, 5000);
    const data = await res.json();
    return { blocked: COUNTRY_BLOCKLIST.has(data.countryCode), countryCode: data.countryCode };
  } catch {
    return { blocked: false };
  }
}

const requestTimestamps = new Map();

export function checkConcurrentRequests(ip, maxConcurrent = 5) {
  const cleanIp = normalizeIp(ip);
  if (!cleanIp) return { allowed: true };
  const now = Date.now();
  const timestamps = requestTimestamps.get(cleanIp) || [];
  const recent = timestamps.filter(t => now - t < 2000);
  if (recent.length >= maxConcurrent) {
    return { allowed: false, count: recent.length };
  }
  recent.push(now);
  requestTimestamps.set(cleanIp, recent);
  return { allowed: true };
}

setInterval(() => {
  const cutoff = Date.now() - 2000;
  for (const [ip, timestamps] of requestTimestamps) {
    const filtered = timestamps.filter(t => t >= cutoff);
    if (filtered.length === 0) requestTimestamps.delete(ip);
    else requestTimestamps.set(ip, filtered);
  }
}, 5000);

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of behaviorScores) {
    if (now - entry.lastSeen > BEHAVIOR_TTL) behaviorScores.delete(ip);
  }
  for (const [ip, entry] of SUSPICIOUS_IPS) {
    if (now - entry.timestamp > SUSPICIOUS_TTL) SUSPICIOUS_IPS.delete(ip);
  }
}, 600000);
