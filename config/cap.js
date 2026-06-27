const CAP_SECRET = process.env.CAP_SECRET;
const CAP_ENDPOINT = process.env.CAP_ENDPOINT;

if (!CAP_SECRET) {
  console.error('Missing CAP_SECRET environment variable');
}

if (!CAP_ENDPOINT) {
  console.error('Missing CAP_ENDPOINT environment variable');
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeUrl(base) {
  return base.endsWith('/') ? base : base + '/';
}

export async function verifyCap(token) {
  if (!token) return false;
  const url = `${normalizeUrl(CAP_ENDPOINT)}siteverify`;
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: CAP_SECRET, response: token }),
    });
    const data = await res.json();
    if (data.success !== true) {
      console.error('[CAP] Verification failed:', JSON.stringify(data));
    }
    return data.success === true;
  } catch (err) {
    console.error('[CAP] Service unreachable at', url, ':', err.message);
    return false;
  }
}
