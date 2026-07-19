import { isIP } from 'net';
import { resolve } from 'path';
import { readFile } from 'fs/promises';

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
  if (parts[0] === 3) return true;
  if (parts[0] === 15) return true;
  if (parts[0] === 23) return true;
  if (parts[0] === 34) return true;
  if (parts[0] === 35) return true;
  if (parts[0] === 44) return true;
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
  if (parts[0] === 47) return true;
  if (parts[0] === 51) return true;
  if (parts[0] === 54) return true;
  if (parts[0] === 63 && parts[1] === 32) return true;
  if (parts[0] === 63 && parts[1] === 35) return true;
  if (parts[0] === 64 && parts[1] === 62) return true;
  if (parts[0] === 64 && parts[1] === 90) return true;
  if (parts[0] === 65) return true;
  if (parts[0] === 66) return true;
  if (parts[0] === 67) return true;
  if (parts[0] === 68) return true;
  if (parts[0] === 69) return true;
  if (parts[0] === 70) return true;
  if (parts[0] === 71) return true;
  if (parts[0] === 72) return true;
  if (parts[0] === 73) return true;
  if (parts[0] === 74) return true;
  if (parts[0] === 75) return true;
  if (parts[0] === 76) return true;
  if (parts[0] === 77) return true;
  if (parts[0] === 78) return true;
  if (parts[0] === 79) return true;
  if (parts[0] === 80) return true;
  if (parts[0] === 81) return true;
  if (parts[0] === 82) return true;
  if (parts[0] === 83) return true;
  if (parts[0] === 84) return true;
  if (parts[0] === 85) return true;
  if (parts[0] === 86) return true;
  if (parts[0] === 87) return true;
  if (parts[0] === 88) return true;
  if (parts[0] === 89) return true;
  if (parts[0] === 90) return true;
  if (parts[0] === 91) return true;
  if (parts[0] === 92) return true;
  if (parts[0] === 93) return true;
  if (parts[0] === 94) return true;
  if (parts[0] === 95) return true;
  if (parts[0] === 96) return true;
  if (parts[0] === 97) return true;
  if (parts[0] === 98) return true;
  if (parts[0] === 99) return true;
  if (parts[0] === 100) return true;
  if (parts[0] === 101) return true;
  if (parts[0] === 102) return true;
  if (parts[0] === 103) return true;
  if (parts[0] === 104) return true;
  if (parts[0] === 104 && parts[1] === 16) return true;
  if (parts[0] === 104 && parts[1] === 17) return true;
  if (parts[0] === 104 && parts[1] === 18) return true;
  if (parts[0] === 104 && parts[1] === 19) return true;
  if (parts[0] === 104 && parts[1] === 20) return true;
  if (parts[0] === 104 && parts[1] === 21) return true;
  if (parts[0] === 104 && parts[1] === 22) return true;
  if (parts[0] === 104 && parts[1] === 23) return true;
  if (parts[0] === 104 && parts[1] === 24) return true;
  if (parts[0] === 104 && parts[1] === 25) return true;
  if (parts[0] === 104 && parts[1] === 26) return true;
  if (parts[0] === 104 && parts[1] === 27) return true;
  if (parts[0] === 104 && parts[1] === 28) return true;
  if (parts[0] === 105) return true;
  if (parts[0] === 106) return true;
  if (parts[0] === 107) return true;
  if (parts[0] === 108) return true;
  if (parts[0] === 109) return true;
  if (parts[0] === 110) return true;
  if (parts[0] === 111) return true;
  if (parts[0] === 112) return true;
  if (parts[0] === 113) return true;
  if (parts[0] === 114) return true;
  if (parts[0] === 115) return true;
  if (parts[0] === 116) return true;
  if (parts[0] === 117) return true;
  if (parts[0] === 118) return true;
  if (parts[0] === 119) return true;
  if (parts[0] === 120) return true;
  if (parts[0] === 121) return true;
  if (parts[0] === 122) return true;
  if (parts[0] === 123) return true;
  if (parts[0] === 124) return true;
  if (parts[0] === 125) return true;
  if (parts[0] === 126) return true;
  if (parts[0] === 128) return true;
  if (parts[0] === 129) return true;
  if (parts[0] === 130) return true;
  if (parts[0] === 131) return true;
  if (parts[0] === 132) return true;
  if (parts[0] === 133) return true;
  if (parts[0] === 134) return true;
  if (parts[0] === 135) return true;
  if (parts[0] === 136) return true;
  if (parts[0] === 137) return true;
  if (parts[0] === 138) return true;
  if (parts[0] === 139) return true;
  if (parts[0] === 140) return true;
  if (parts[0] === 141) return true;
  if (parts[0] === 142) return true;
  if (parts[0] === 143) return true;
  if (parts[0] === 144) return true;
  if (parts[0] === 145) return true;
  if (parts[0] === 146) return true;
  if (parts[0] === 147) return true;
  if (parts[0] === 148) return true;
  if (parts[0] === 149) return true;
  if (parts[0] === 150) return true;
  if (parts[0] === 151) return true;
  if (parts[0] === 152) return true;
  if (parts[0] === 153) return true;
  if (parts[0] === 154) return true;
  if (parts[0] === 155) return true;
  if (parts[0] === 156) return true;
  if (parts[0] === 157) return true;
  if (parts[0] === 158) return true;
  if (parts[0] === 159) return true;
  if (parts[0] === 160) return true;
  if (parts[0] === 161) return true;
  if (parts[0] === 162) return true;
  if (parts[0] === 163) return true;
  if (parts[0] === 164) return true;
  if (parts[0] === 165) return true;
  if (parts[0] === 166) return true;
  if (parts[0] === 167) return true;
  if (parts[0] === 168) return true;
  if (parts[0] === 169) return true;
  if (parts[0] === 170) return true;
  if (parts[0] === 171) return true;
  if (parts[0] === 172) return true;
  if (parts[0] === 173) return true;
  if (parts[0] === 174) return true;
  if (parts[0] === 175) return true;
  if (parts[0] === 176) return true;
  if (parts[0] === 177) return true;
  if (parts[0] === 178) return true;
  if (parts[0] === 179) return true;
  if (parts[0] === 180) return true;
  if (parts[0] === 181) return true;
  if (parts[0] === 182) return true;
  if (parts[0] === 183) return true;
  if (parts[0] === 184) return true;
  if (parts[0] === 185) return true;
  if (parts[0] === 186) return true;
  if (parts[0] === 187) return true;
  if (parts[0] === 188) return true;
  if (parts[0] === 189) return true;
  if (parts[0] === 190) return true;
  if (parts[0] === 191) return true;
  if (parts[0] === 192 && parts[1] === 0) return true;
  if (parts[0] === 192 && parts[1] === 3) return true;
  if (parts[0] === 193) return true;
  if (parts[0] === 194) return true;
  if (parts[0] === 195) return true;
  if (parts[0] === 196) return true;
  if (parts[0] === 197) return true;
  if (parts[0] === 198) return true;
  if (parts[0] === 199) return true;
  if (parts[0] === 200) return true;
  if (parts[0] === 201) return true;
  if (parts[0] === 202) return true;
  if (parts[0] === 203) return true;
  if (parts[0] === 204) return true;
  if (parts[0] === 205) return true;
  if (parts[0] === 206) return true;
  if (parts[0] === 207) return true;
  if (parts[0] === 208) return true;
  if (parts[0] === 209) return true;
  if (parts[0] === 210) return true;
  if (parts[0] === 211) return true;
  if (parts[0] === 212) return true;
  if (parts[0] === 213) return true;
  if (parts[0] === 214) return true;
  if (parts[0] === 215) return true;
  if (parts[0] === 216) return true;
  if (parts[0] === 217) return true;
  if (parts[0] === 218) return true;
  if (parts[0] === 219) return true;
  if (parts[0] === 220) return true;
  if (parts[0] === 221) return true;
  if (parts[0] === 222) return true;
  return false;
}

export function checkHoneypot(body) {
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
    const reverseHost = `${parts[3]}.${parts[2]}.${parts[1]}.${parts[0]}.tor.dan.me.uk`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`http://${reverseHost}`, { signal: controller.signal });
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
