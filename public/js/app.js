const API_BASE = window.location.origin;

const state = {
  user: null,
  token: localStorage.getItem('zh_token'),
  currentPage: 'overview',
  servers: [],
  rgpdConsent: JSON.parse(localStorage.getItem('zh_rgpd_consent') || 'null'),
  serverDetailTab: 'info',
};

function getRgpdConsent() {
  return state.rgpdConsent;
}

function setRgpdConsent(preferences) {
  state.rgpdConsent = preferences;
  localStorage.setItem('zh_rgpd_consent', JSON.stringify(preferences));
}

function renderCookieBanner() {
  if (state.rgpdConsent) return;
  const existing = document.getElementById('cookie-consent-banner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'cookie-consent-banner';
  banner.className = 'cookie-banner';
  banner.innerHTML = `
    <div class="cookie-banner-text">
      <p>
        We use cookies for authentication and security (Cloudflare Turnstile). No tracking or advertising cookies are used.
        For more information, read our privacy policy.
      </p>
    </div>
    <div class="cookie-banner-actions">
      <button class="btn btn-ghost btn-sm" id="cookie-essential-btn">Essential Only</button>
      <button class="btn btn-primary btn-sm" id="cookie-accept-all-btn">Accept All</button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('cookie-essential-btn').addEventListener('click', () => {
    setRgpdConsent({ essential: true, analytics: false, timestamp: new Date().toISOString() });
    banner.remove();
  });
  document.getElementById('cookie-accept-all-btn').addEventListener('click', () => {
    setRgpdConsent({ essential: true, analytics: true, timestamp: new Date().toISOString() });
    banner.remove();
  });
}

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function md5(s) {
  function F(x,y,z) { return (x & y) | (~x & z); }
  function G(x,y,z) { return (x & z) | (y & ~z); }
  function H(x,y,z) { return x ^ y ^ z; }
  function I(x,y,z) { return y ^ (x | ~z); }
  function rol(x,n) { return (x << n) | (x >>> (32 - n)); }
  function add(x,y) { return (x + y) >>> 0; }
  function toHex(n) { let h=''; for(let i=0;i<4;i++) h+=((n>>(i*8))&0xFF).toString(16).padStart(2,'0'); return h; }
  const T = new Array(64);
  for(let i=1;i<=64;i++) T[i-1] = Math.floor(Math.abs(Math.sin(i)) * 0x100000000) >>> 0;
  const s_ = [7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
  const S = (function(){ const r=[]; for(let i=0;i<64;i++) r[i]=s_[(i>>3<<2)+(i%4)]; return r; })();
  const K = [0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3];
  s = unescape(encodeURIComponent(s));
  const len = s.length;
  const msg = []; for(let i=0;i<len*2;i+=2) msg.push((s.charCodeAt(i/2)>>(8-(i%2)*8))&0xFF);
  const bitLen = len * 8;
  msg.push(0x80);
  while((msg.length+8)%64!=0) msg.push(0);
  for(let i=0;i<8;i++) msg.push((bitLen>>>(i*8))&0xFF);
  let h0=0x67452301,h1=0xEFCDAB89,h2=0x98BADCFE,h3=0x10325476;
  for(let i=0;i<msg.length;i+=64) {
    let a=h0,b=h1,c=h2,d=h3,X=msg.slice(i,i+64);
    for(let j=0;j<64;j++) {
      const f = [F,G,H,I][K[j]](b,c,d);
      const g = j<16?j:(j<32?(5*j+1)%16:(j<48?(3*j+5)%16:(7*j)%16));
      const w = X[g*4]|(X[g*4+1]<<8)|(X[g*4+2]<<16)|(X[g*4+3]<<24);
      const temp = add(add(add(rol(a,S[j]),f),T[j]),w);
      d=c;c=b;b=a;a=add(b,temp);
    }
    h0=add(h0,a);h1=add(h1,b);h2=add(h2,c);h3=add(h3,d);
  }
  return toHex(h0)+toHex(h1)+toHex(h2)+toHex(h3);
}

function gravatarUrl(email, size = 32) {
  if (!email) return '';
  const hash = md5(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}

function html(strings, ...values) {
  return strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });
  } catch {
    throw new Error('Unable to reach the server. Please check your connection and try again.');
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Server error: please try again in a few moments.');
  }
  if (res.status === 403 && data.error === 'Invalid or expired token') {
    state.token = null;
    state.user = null;
    localStorage.removeItem('zh_token');
    localStorage.removeItem('zh_user');
    renderLoginPage();
    throw new Error('Session expired. Please sign in again.');
  }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showToast(message, type = 'success') {
  const container = $('#toast-container') || (() => {
    const el = document.createElement('div');
    el.id = 'toast-container';
    el.className = 'toast-container';
    document.body.appendChild(el);
    return el;
  })();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showError(form, message) {
  const errorEl = form.querySelector('.auth-error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add('show');
  }
}

function hideError(form) {
  const errorEl = form.querySelector('.auth-error');
  if (errorEl) errorEl.classList.remove('show');
}

const turnstileWidgets = {};

function initTurnstile(selector) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el) return;
  const tryRender = () => {
    if (typeof turnstile !== 'undefined') {
      if (el.querySelector('iframe')) return;
      const widgetId = turnstile.render(el, { sitekey: '0x4AAAAAADjivxHTaDDdYR8W', theme: 'dark' });
      turnstileWidgets[selector] = widgetId;
    } else {
      setTimeout(tryRender, 200);
    }
  };
  tryRender();
}

function resetTurnstile(selector) {
  const id = turnstileWidgets[selector];
  if (typeof turnstile !== 'undefined' && id !== undefined) {
    turnstile.reset(id);
  }
}

// ===== AUTH PAGES =====
function renderLoginPage() {
  const app = $('#app');
  app.innerHTML = html`
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <img src="https://status.zero-host.org/upload/logo1.png?t=1781280015614" alt="ZeroHost" />
          <span class="auth-logo-text">Zero<span class="auth-logo-accent">Host</span></span>
        </div>
        <h1 class="auth-title">Welcome back</h1>
        <p class="auth-subtitle">Sign in to your dashboard</p>
        <form id="login-form">
          <div class="auth-error"></div>
          <div class="form-group">
            <label for="login-email">Email</label>
            <input type="email" id="login-email" placeholder="your@email.com" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" placeholder="••••••••" required autocomplete="current-password" />
          </div>
          <div id="login-turnstile" style="margin-bottom:20px"></div>
          <button type="submit" class="btn btn-primary btn-full" id="login-btn">
            Sign In
          </button>

        </form>
        <div class="auth-footer">
          Don't have an account? <a href="#" id="go-register">Create one</a>
        </div>
      </div>
    </div>
  `;

  $('#login-form').addEventListener('submit', handleLogin);
  initTurnstile('#login-turnstile');
  $('#go-register').addEventListener('click', (e) => {
    e.preventDefault();
    renderRegisterPage();
  });
}

function renderRegisterPage() {
  const app = $('#app');
  app.innerHTML = html`
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <img src="https://status.zero-host.org/upload/logo1.png?t=1781280015614" alt="ZeroHost" />
          <span class="auth-logo-text">Zero<span class="auth-logo-accent">Host</span></span>
        </div>
        <h1 class="auth-title">Create account</h1>
        <p class="auth-subtitle">Start hosting for free</p>
        <form id="register-form">
          <div class="auth-error"></div>
          <div class="form-group">
            <label for="reg-email">Email</label>
            <input type="email" id="reg-email" placeholder="your@email.com" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label for="reg-username">Username</label>
            <input type="text" id="reg-username" placeholder="myusername" required autocomplete="username" />
          </div>
          <div class="form-group">
            <label for="reg-password">Password</label>
            <input type="password" id="reg-password" placeholder="At least 8 characters" required autocomplete="new-password" />
          </div>
          <div class="consent-group">
            <input type="checkbox" id="reg-rgpd-consent" required />
            <label for="reg-rgpd-consent">
              I agree to the privacy policy and consent to the processing of my personal data (email, username, IP address) for account management purposes. <span style="color:var(--accent-red)">*</span>
            </label>
          </div>
          <div id="register-turnstile" style="margin-bottom:20px"></div>
          <button type="submit" class="btn btn-primary btn-full" id="register-btn">
            Create Account
          </button>

        </form>
        <div class="auth-footer">
          Already have an account? <a href="#" id="go-login">Sign in</a>
        </div>
      </div>
    </div>
  `;

  $('#register-form').addEventListener('submit', handleRegister);
  initTurnstile('#register-turnstile');
  $('#go-login').addEventListener('click', (e) => {
    e.preventDefault();
    renderLoginPage();
  });
}

async function handleLogin(e) {
  e.preventDefault();
  hideError(e.target);
  const btn = $('#login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in...';

  try {
    const turnstileToken = document.querySelector('#login-turnstile')?.querySelector('[name="cf-turnstile-response"]')?.value || '';
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: $('#login-email').value,
        password: $('#login-password').value,
        cfTurnstile: turnstileToken,
      }),
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('zh_token', data.token);
    localStorage.setItem('zh_user', JSON.stringify(data.user));
    renderDashboard();
  } catch (err) {
    showError(e.target, err.message);
    resetTurnstile('#login-turnstile');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  hideError(e.target);
  const btn = $('#register-btn');

  const rgpdConsent = document.getElementById('reg-rgpd-consent')?.checked;
  if (!rgpdConsent) {
    showError(e.target, 'You must accept the privacy policy to create an account.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating...';

  try {
    const turnstileToken = document.querySelector('#register-turnstile')?.querySelector('[name="cf-turnstile-response"]')?.value || '';
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: $('#reg-email').value,
        username: $('#reg-username').value,
        password: $('#reg-password').value,
        cfTurnstile: turnstileToken,
        rgpdConsent: true,
      }),
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('zh_token', data.token);
    localStorage.setItem('zh_user', JSON.stringify(data.user));
    renderDashboard();
  } catch (err) {
    showError(e.target, err.message);
    resetTurnstile('#register-turnstile');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Create Account';
  }
}

// ===== DASHBOARD =====
async function renderDashboard() {
  const app = $('#app');
  app.innerHTML = html`
    <div class="dashboard-layout">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <a href="#" class="sidebar-logo" id="sidebar-logo-link">
            <img src="https://status.zero-host.org/upload/logo1.png?t=1781280015614" alt="ZeroHost" />
            <span class="sidebar-logo-text">Zero<span style="color:var(--accent-3)">Host</span></span>
          </a>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-section-label">Main</div>
          <a class="nav-item active" data-page="overview" href="/overview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Overview
          </a>
          <a class="nav-item" data-page="servers" href="/servers">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="6" cy="18" r="1" fill="currentColor"/></svg>
            My Servers
          </a>
          <div class="nav-section-label">Actions</div>
          <a class="nav-item" data-page="create" href="/create">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            Create Server
          </a>
          <div class="nav-section-label">Links</div>
          <a class="nav-item" data-page="pterodactyl" href="/pterodactyl">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M9 6V5a2 2 0 012-2h2a2 2 0 012 2v1M9 12h6M9 16h4"/></svg>
            Open Pterodactyl
          </a>
          <a class="nav-item" href="https://status.zero-host.org" target="_blank">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            View Status
          </a>
          <a class="nav-item" href="https://discord.zero-host.org" target="_blank">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0416-.084.077.077 0 01.034-.0508c.1258-.0933.2517-.1919.3718-.2908a.074.074 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2908a.077.077 0 01.034.0508.077.077 0 01-.0417.084c-.5978.3429-1.2196.6447-1.8722.8923a.077.077 0 00-.0416.1057c.3528.699.7644 1.3638 1.226 1.9942a.076.076 0 00.0842.0276c1.961-.6066 3.9495-1.5218 5.9929-3.0294a.077.077 0 00.0312-.0561c.5004-5.053-.838-9.5539-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/></svg>
            Join Discord
          </a>
        </nav>
        <div class="sidebar-footer">
          <div class="user-info" id="sidebar-user-info" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="user-avatar" id="avatar-container"><img src="${gravatarUrl(state.user?.email, 32)}" alt="" width="32" height="32" style="border-radius:50%;width:32px;height:32px;object-fit:cover" onerror="this.style.display='none';document.getElementById('avatar-fallback').style.display='flex'"/><span id="avatar-fallback" style="display:none">${state.user?.username?.[0]?.toUpperCase() || 'U'}</span></div>
              <div>
                <div class="user-name">${state.user?.username || 'User'}</div>
                <div class="user-email">${state.user?.email || ''}</div>
              </div>
            </div>
            <div id="logout-btn" style="cursor:pointer;color:var(--text-muted);display:flex;align-items:center;padding:6px;border-radius:var(--radius-sm);transition:all var(--transition)" title="Sign Out">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            </div>
          </div>
          <div style="border-top:1px solid var(--border);margin:6px -12px 0"></div>
          <div style="padding:8px 12px 0;display:flex;gap:16px;justify-content:center;flex-wrap:wrap">

          </div>
          <div style="padding:4px 0 8px;text-align:center;font-size:0.7rem;color:var(--text-muted);letter-spacing:0.05em">v0.9.6 BETA</div>
        </div>
      </aside>

      <button class="hamburger-toggle" id="hamburger-toggle" aria-label="Toggle menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
      </button>

      <main class="main-content">
        <div class="page active" id="page-overview"></div>
        <div class="page" id="page-servers"></div>
        <div class="page" id="page-create"></div>
        <div class="page" id="page-pterodactyl"></div>
        <div class="page" id="page-account"></div>
        <div class="page" id="page-server-detail"></div>
      </main>
    </div>

    <div class="modal-overlay" id="modal-overlay">
      <div class="modal" id="modal-content"></div>
    </div>
  `;

  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      navigateTo(page);
    });
  });

  $('#logout-btn').addEventListener('click', async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    state.token = null;
    state.user = null;
    localStorage.removeItem('zh_token');
    localStorage.removeItem('zh_user');
    renderLoginPage();
  });

  $('#sidebar-user-info').addEventListener('click', (e) => {
    if (e.target.closest('#logout-btn')) return;
    navigateTo('account');
  });

  $('#hamburger-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  const page = window.location.pathname.replace('/', '') || 'overview';
  navigateTo(page);
}

function navigateTo(page) {
  if (pteroTimeout) clearTimeout(pteroTimeout);
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const parts = page.split('/');
  const basePage = parts[0];
  const param = parts[1];

  state.currentPage = basePage;
  state.serverId = param ? parseInt(param) : null;
  state.serverDetailTab = 'info';
  history.pushState({ page: basePage, serverId: state.serverId }, '', `/${page}`);

  if (basePage === 'server' && state.serverId) {
    const targetPage = $('#page-server-detail');
    if (targetPage) targetPage.classList.add('active');
    renderServerDetail(state.serverId);
  } else {
    const targetPage = $(`#page-${basePage}`);
    const targetNav = document.querySelector(`.nav-item[data-page="${basePage}"]`);
    if (targetPage) targetPage.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    if (basePage === 'overview') renderOverview();
    else if (basePage === 'servers') renderServers();
    else if (basePage === 'create') renderCreateServer();
    else if (basePage === 'pterodactyl') renderPterodactyl();
    else if (basePage === 'account') {
      if (param === 'edit') renderAccountEdit();
      else if (param === 'links') renderAccountLinks();
      else if (param === 'dangerous') renderDangerous();
      else renderAccount();
    }
  }

  if (window.innerWidth <= 768) {
    $('#sidebar').classList.remove('open');
  }
}

window.addEventListener('popstate', () => {
  const path = window.location.pathname;
  const parts = path.replace(/^\//, '').split('/');
  const basePage = parts[0] || 'overview';
  const param = parts[1];

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  state.currentPage = basePage;
  state.serverId = param ? parseInt(param) : null;
  state.serverDetailTab = 'info';

  if (basePage === 'server' && state.serverId) {
    const targetPage = $('#page-server-detail');
    if (targetPage) targetPage.classList.add('active');
    renderServerDetail(state.serverId);
  } else {
    const targetPage = $(`#page-${basePage}`);
    const targetNav = document.querySelector(`.nav-item[data-page="${basePage}"]`);
    if (targetPage) targetPage.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    if (basePage === 'overview') renderOverview();
    else if (basePage === 'servers') renderServers();
    else if (basePage === 'create') renderCreateServer();
    else if (basePage === 'pterodactyl') renderPterodactyl();
    else if (basePage === 'account') {
      if (param === 'edit') renderAccountEdit();
      else if (param === 'links') renderAccountLinks();
      else if (param === 'dangerous') renderDangerous();
      else renderAccount();
    }
  }
});

// ===== OVERVIEW =====
async function renderOverview() {
  const el = $('#page-overview');
  el.innerHTML = html`
    <div class="page-header">
      <h1 class="page-title">Overview</h1>
      <p class="page-subtitle">Welcome back, ${state.user?.username || 'user'}</p>
    </div>
    <div class="stat-grid" id="stats-grid">
      <div class="stat-card"><div class="stat-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg></div><div class="stat-value" id="stat-total">—</div><div class="stat-label">Total Servers</div></div>
      <div class="stat-card"><div class="stat-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div><div class="stat-value" id="stat-active">—</div><div class="stat-label">Active Servers</div></div>
      <div class="stat-card"><div class="stat-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="4"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></div><div class="stat-value" id="stat-slots">—</div><div class="stat-label">Server Slots</div></div>
      <div class="stat-card"><div class="stat-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div><div class="stat-value" id="stat-renew">—</div><div class="stat-label">To Renew</div></div>
    </div>
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Recent Servers</h2>
      </div>
      <div id="recent-servers-list">
        <div style="text-align:center;padding:32px;color:var(--text-secondary)"><span class="spinner"></span> Loading...</div>
      </div>
    </div>
  `;

  try {
    const data = await api('/servers/overview');

    if (data.pteroError) {
      $('#page-overview .card').insertAdjacentHTML('afterbegin', html`
        <div style="background:var(--accent-orange);color:var(--bg-dark);padding:12px 16px;border-radius:var(--radius-md);margin-bottom:16px;font-size:0.875rem">
          ${data.pteroError}
        </div>
      `);
    }

    $('#stat-total').textContent = data.totalServers;
    $('#stat-active').textContent = data.activeServers;
    const limit = data.serverLimit || 3;
    $('#stat-slots').textContent = data.totalServers + '/' + limit;
    const toRenew = data.servers.filter(s => {
      const meta = s.serverMeta;
      if (!meta) return false;
      return new Date(meta.expires_at) <= new Date();
    }).length;
    $('#stat-renew').textContent = toRenew;
    state.servers = data.servers;

    if (data.servers.length === 0 && !data.pteroError) {
      $('#recent-servers-list').innerHTML = html`
        <div class="empty-state">
          <div class="empty-state-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg></div>
          <div class="empty-state-title">No servers yet</div>
          <div class="empty-state-desc">Create your first server to get started</div>
          <button class="btn btn-primary" id="empty-create-server-btn">Create Server</button>
        </div>
      `;
      $('#empty-create-server-btn').addEventListener('click', () => navigateTo('create'));
    } else if (data.servers.length > 0) {
      $('#recent-servers-list').innerHTML = html`
        <div class="server-grid">
          ${data.servers.slice(0, 6).map(s => renderServerCard(s)).join('')}
        </div>
      `;
    }
  } catch (err) {
    $('#recent-servers-list').innerHTML = html`
      <div style="text-align:center;padding:32px;color:var(--accent-red)">Failed to load: ${err.message}</div>
    `;
  }
}

function formatDate(d) {
  if (!d) return 'N/A';
  const date = new Date(d);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysRemaining(expiresAt) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function renderServerCard(s) {
  const eggName = s.eggDetails?.name || `Egg #${s.egg}`;
  const alloc = s.allocationDetails;
  const isInstalling = s.status === 'installing' || s.installed === 0 || s.installed === '0' || s.installed === false;
  const isSuspended = s.status === 'suspended';
  const statusClass = isSuspended ? 'status-suspended' : (isInstalling ? 'status-installing' : 'status-active');
  const statusLabel = isSuspended ? 'Suspended' : (isInstalling ? 'Installing' : 'Active');
  const allocStr = alloc ? `${alloc.alias || alloc.nodeFqdn || alloc.ip}:${alloc.port}` : (s.nodeFqdn || `Node #${s.node}`);
  const meta = s.serverMeta;
  const days = meta ? daysRemaining(meta.expires_at) : null;
  const canRenew = days !== null && days <= 7 && days >= -7;
  const expClass = days !== null && days <= 0 ? 'expired' : (days !== null && days <= 7 ? 'expiring' : '');
  return html`
    <div class="server-card">
      <div class="server-card-top" style="cursor:pointer" onclick="navigateTo('server/${s.id}')">
        <span class="server-card-name">${s.name}</span>
        <span class="server-card-status ${statusClass}">${statusLabel}</span>
      </div>
      <div class="server-card-details" style="cursor:pointer" onclick="navigateTo('server/${s.id}')">
        <span class="server-detail-tag">${eggName}</span>
        <span class="server-detail-tag">${allocStr}</span>
        <span class="server-detail-tag">${s.limits.memory > 0 ? s.limits.memory + ' MB' : '∞'}</span>
      </div>
      ${meta ? html`
        <div class="server-card-expiry ${expClass}">
          <span>Expires: ${formatDate(meta.expires_at)}</span>
          ${days !== null ? html`<span>(${days > 0 ? days + ' days' : 'Expired'})</span>` : ''}
        </div>
      ` : ''}
      <div class="server-card-actions">
        <a href="https://panel.zero-host.org/server/${s.identifier}" target="_blank" class="btn btn-ghost btn-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
          Open Panel
        </a>
        ${canRenew ? html`
          <button class="btn btn-primary btn-sm btn-renew-server" data-server-id="${s.id}">Renew</button>
        ` : ''}
      </div>
    </div>
  `;
}

// ===== SERVERS PAGE =====
async function renderServers() {
  const el = $('#page-servers');
  el.innerHTML = html`
    <div class="page-header">
      <h1 class="page-title">My Servers</h1>
      <p class="page-subtitle">All your servers on ZeroHost</p>
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Egg</th>
            <th>Allocation</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="servers-table-body">
          <tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-secondary)"><span class="spinner"></span> Loading...</td></tr>
        </tbody>
      </table>
    </div>
    </div>
  `;

  try {
    const data = await api('/servers/list');
    state.servers = data.servers;

    if (data.servers.length === 0) {
      $('#servers-table-body').innerHTML = html`
        <tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-secondary)">No servers yet. <a href="/create" onclick="navigateTo('create')">Create one</a></td></tr>
      `;
      return;
    }

    $('#servers-table-body').innerHTML = data.servers.map(s => {
      const eggName = s.eggDetails?.name || `Egg #${s.egg}`;
      const alloc = s.allocationDetails;
  const isInstalling = s.status === 'installing' || s.installed === 0 || s.installed === '0' || s.installed === false;
      const isSuspended = s.status === 'suspended';
      const statusClass = isSuspended ? 'status-suspended' : (isInstalling ? 'status-installing' : 'status-active');
      const statusLabel = isSuspended ? 'Suspended' : (isInstalling ? 'Installing' : 'Active');
      const meta = s.serverMeta;
      const days = meta ? daysRemaining(meta.expires_at) : null;
      const canRenew = days !== null && days <= 7 && days >= -7;
      const expClass = days !== null && days <= 0 ? 'expired' : (days !== null && days <= 7 ? 'expiring' : '');
      return html`
        <tr>
          <td><strong><a href="/server/${s.id}" onclick="event.preventDefault();navigateTo('server/${s.id}')" style="color:inherit;text-decoration:none">${s.name}</a></strong></td>
          <td><span class="server-detail-tag">${eggName}</span></td>
          <td><span class="server-detail-tag">${alloc ? `${alloc.alias || alloc.nodeFqdn || alloc.ip}:${alloc.port}` : (s.nodeFqdn || `Node #${s.node}`)}</span></td>
          <td><span class="server-card-status ${statusClass}">${statusLabel}</span></td>
          <td>
            <div style="display:flex;gap:6px">
              <a class="btn btn-ghost btn-sm" href="/server/${s.id}" onclick="event.preventDefault();navigateTo('server/${s.id}')">Manage</a>
              <a href="https://panel.zero-host.org/server/${s.identifier}" target="_blank" class="btn btn-ghost btn-sm">Open Pterodactyl</a>
              ${canRenew ? html`
                <button class="btn btn-primary btn-sm btn-renew-server" data-server-id="${s.id}">Renew</button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    $('#servers-table-body').innerHTML = html`
      <tr><td colspan="5" style="text-align:center;padding:32px;color:var(--accent-red)">Error: ${err.message}</td></tr>
    `;
  }
}

// ===== CREATE SERVER =====
let eggCache = [];

async function renderCreateServer() {
  const el = $('#page-create');
  el.innerHTML = html`
    <div class="page-header">
      <h1 class="page-title">Create Server</h1>
      <p class="page-subtitle">Deploy a new server in seconds</p>
    </div>
    <div class="card" style="max-width: 560px;">
      <form id="create-server-form">
        <div class="auth-error" id="create-error"></div>
        <div class="form-group">
          <label for="create-name">Server Name</label>
          <input type="text" id="create-name" placeholder="My Awesome Server" required />
        </div>
        <div class="form-group">
          <label>Egg Type</label>
          <div class="custom-select" id="custom-egg-select">
            <button type="button" class="custom-select-trigger" id="custom-egg-trigger">
              <span id="custom-egg-label">Select an egg...</span>
              <svg class="custom-select-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <div class="custom-select-dropdown" id="custom-egg-dropdown"></div>
          </div>
        </div>
        <div id="egg-variables"></div>
        <div class="card" style="margin-top:20px;background:var(--bg-secondary)">
          <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px">Default resources</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <span class="server-detail-tag">512 MB RAM</span>
            <span class="server-detail-tag">50% CPU</span>
            <span class="server-detail-tag">3 GB Disk</span>
          </div>
        </div>
        <div id="create-turnstile" style="margin-top:20px"></div>
        <button type="submit" class="btn btn-primary btn-full" id="create-btn" style="margin-top:16px">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          Create Server
        </button>
      </form>
    </div>
  `;

  $('#custom-egg-trigger').addEventListener('click', e => {
    e.stopPropagation();
    $('#custom-egg-dropdown').classList.toggle('open');
  });
  document.addEventListener('click', function closeSelect(e) {
    if (!e.target.closest('.custom-select')) {
      $('#custom-egg-dropdown')?.classList.remove('open');
    }
  });
  $('#create-server-form').addEventListener('submit', handleCreateServer);
  initTurnstile('#create-turnstile');

  try {
    const data = await api('/servers/eggs');
    eggCache = data.eggs;
    const dropdown = $('#custom-egg-dropdown');
    const nestLabels = { 5: 'Application', 6: 'Code' };
    const grouped = {};
    for (const e of data.eggs) {
      if (!grouped[e.nestId]) grouped[e.nestId] = [];
      grouped[e.nestId].push(e);
    }
    let htmlStr = '';
    for (const nestId of Object.keys(grouped).sort()) {
      htmlStr += `<div class="custom-select-category">${nestLabels[nestId] || `Nest ${nestId}`}</div>`;
      for (const e of grouped[nestId]) {
        htmlStr += `<div class="custom-select-option" data-value="${e.eggId},${e.nestId}">${e.name}</div>`;
      }
    }
    dropdown.innerHTML = htmlStr;
    dropdown.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.addEventListener('click', () => {
        $('#custom-egg-label').textContent = opt.textContent;
        $('#custom-egg-trigger').dataset.value = opt.dataset.value;
        dropdown.classList.remove('open');
        handleEggChange();
      });
    });
  } catch {}
}

function handleEggChange() {
  const varsEl = $('#egg-variables');
  varsEl.innerHTML = '';
}

async function handleCreateServer(e) {
  e.preventDefault();
  const btn = $('#create-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating...';

  const name = $('#create-name').value.trim();
  const eggVal = $('#custom-egg-trigger').dataset.value;
  if (!name || !eggVal) {
    showToast('Please fill in all fields', 'error');
    btn.disabled = false;
    btn.innerHTML = 'Create Server';
    return;
  }

  const [eggId, nestId] = eggVal.split(',').map(Number);
  const egg = eggCache.find(e => e.eggId === eggId && e.nestId === nestId);

  const environment = {};
  if (egg && egg.variables) {
    for (const v of egg.variables) {
      environment[v.envVariable] = v.defaultValue || '';
    }
  }

  try {
    const turnstileToken = document.querySelector('#create-turnstile')?.querySelector('[name="cf-turnstile-response"]')?.value || '';
    await api('/servers/create', {
      method: 'POST',
      body: JSON.stringify({ name, nestId, eggId, environment, cfTurnstile: turnstileToken }),
    });
    showToast(`Server "${name}" created successfully!`, 'success');
    navigateTo('servers');
  } catch (err) {
    showToast(err.message, 'error');
    resetTurnstile('#create-turnstile');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Create Server';
  }
}

// ===== PTERODACTYL PAGE =====
let pteroTimeout = null;

function renderPterodactyl() {
  if (pteroTimeout) clearTimeout(pteroTimeout);
  const el = $('#page-pterodactyl');
  el.innerHTML = html`
    <div class="page-header">
      <h1 class="page-title">Pterodactyl Panel</h1>
      <p class="page-subtitle">Redirecting to the panel in 5 seconds...</p>
    </div>
    <div class="ptero-grid">
      <div class="card ptero-card">
        <div class="ptero-card-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M9 6V5a2 2 0 012-2h2a2 2 0 012 2v1M9 12h6M9 16h4"/></svg>
        </div>
        <h2 class="ptero-card-title">Opening Pterodactyl...</h2>
        <p class="ptero-card-desc">
          You are being redirected to the Pterodactyl panel. If nothing happens, click the button below.
        </p>
        <div class="ptero-info" style="margin-bottom:24px">
          <div class="ptero-info-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span><strong>Login:</strong> use your dashboard email and password</span>
          </div>
          <div class="ptero-info-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span><strong>Same password</strong> as your dashboard account</span>
          </div>
        </div>
        <a href="https://panel.zero-host.org" target="_blank" class="btn btn-primary btn-full" id="ptero-open-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
          Open Panel Now
        </a>
      </div>
    </div>
  `;
  pteroTimeout = setTimeout(() => {
    window.open('https://panel.zero-host.org', '_blank');
  }, 5000);
  document.getElementById('ptero-open-btn').addEventListener('click', () => {
    clearTimeout(pteroTimeout);
    pteroTimeout = null;
  });
}

// ===== ACCOUNT PAGE =====
function renderAccount() {
  const el = $('#page-account');
  el.innerHTML = html`
    <div class="page-header">
      <h1 class="page-title">Account</h1>
      <p class="page-subtitle">Manage your account settings</p>
    </div>
    <div class="account-grid">
      <div class="card account-menu-card" id="account-menu-edit" style="cursor:pointer">
        <div class="account-menu-item">
          <div class="account-menu-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </div>
          <div class="account-menu-text">
            <div class="account-menu-title">Change Account Info</div>
            <div class="account-menu-desc">Update your email address or password</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>

      <div class="card account-menu-card" id="account-menu-links" style="cursor:pointer">
        <div class="account-menu-item">
          <div class="account-menu-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          </div>
          <div class="account-menu-text">
            <div class="account-menu-title">Linked Accounts</div>
            <div class="account-menu-desc">Manage your linked accounts</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>

      <div class="card account-menu-card" id="account-menu-dangerous" style="cursor:pointer">
        <div class="account-menu-item">
          <div class="account-menu-icon" style="color:var(--accent-red)">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4"/><circle cx="12" cy="18" r="1"/></svg>
          </div>
          <div class="account-menu-text">
            <div class="account-menu-title">Dangerous Zone & Export Account Data</div>
            <div class="account-menu-desc">Delete your account or export your personal data (RGPD)</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>
    </div>
  `;

  $('#account-menu-edit').addEventListener('click', () => navigateTo('account/edit'));
  $('#account-menu-links').addEventListener('click', () => navigateTo('account/links'));
  $('#account-menu-dangerous').addEventListener('click', () => navigateTo('account/dangerous'));
}

function renderAccountEdit() {
  const el = $('#page-account');
  el.innerHTML = html`
    <div class="page-header" style="display:flex;align-items:center;gap:12px">
      <a href="/account" onclick="event.preventDefault();navigateTo('account')" style="color:var(--text-muted);display:flex;padding:4px;border-radius:var(--radius-sm);cursor:pointer">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </a>
      <div>
        <h1 class="page-title" style="margin:0">Change Account Info</h1>
        <p class="page-subtitle" style="margin:0">Update your email address or password</p>
      </div>
    </div>
    <div class="account-grid">
      <div class="card">
        <h2 class="card-title" style="margin-bottom:20px">Change Email</h2>
        <form id="change-email-form" style="max-width:480px">
          <div class="form-group">
            <label for="acc-new-email">New Email</label>
            <input type="email" id="acc-new-email" placeholder="${state.user?.email || 'Enter new email'}" required />
          </div>
          <div class="form-group">
            <label for="acc-email-pw">Current Password</label>
            <input type="password" id="acc-email-pw" placeholder="Enter your password" required autocomplete="current-password" />
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="change-email-btn">Change Email</button>
        </form>
      </div>

      <div class="card">
        <h2 class="card-title" style="margin-bottom:20px">Change Password</h2>
        <form id="change-password-form" style="max-width:480px">
          <div class="form-group">
            <label for="acc-current-pw">Current Password</label>
            <input type="password" id="acc-current-pw" placeholder="Enter current password" required autocomplete="current-password" />
          </div>
          <div class="form-group">
            <label for="acc-new-pw">New Password</label>
            <input type="password" id="acc-new-pw" placeholder="At least 8 characters" required autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label for="acc-confirm-pw">Confirm New Password</label>
            <input type="password" id="acc-confirm-pw" placeholder="Repeat new password" required autocomplete="new-password" />
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="change-pw-btn">Change Password</button>
        </form>
      </div>
    </div>
  `;

  $('#change-email-form').addEventListener('submit', handleChangeEmail);
  $('#change-password-form').addEventListener('submit', handleChangePassword);
}

function renderAccountLinks() {
  const el = $('#page-account');
  el.innerHTML = html`
    <div class="page-header" style="display:flex;align-items:center;gap:12px">
      <a href="/account" onclick="event.preventDefault();navigateTo('account')" style="color:var(--text-muted);display:flex;padding:4px;border-radius:var(--radius-sm);cursor:pointer">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </a>
      <div>
        <h1 class="page-title" style="margin:0">Linked Accounts</h1>
        <p class="page-subtitle" style="margin:0">Manage your linked accounts</p>
      </div>
    </div>
    <div class="card">
      <p style="color:var(--text-muted);font-size:0.9rem">No third-party account linking available.</p>
    </div>
  `;
}

async function handleChangeEmail(e) {
  e.preventDefault();
  const btn = $('#change-email-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const newEmail = $('#acc-new-email').value.trim();
    const password = $('#acc-email-pw').value;
    if (!newEmail || !password) {
      showToast('Please fill in all fields', 'error');
      return;
    }
    const data = await api('/auth/change-email', {
      method: 'POST',
      body: JSON.stringify({ newEmail, password }),
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('zh_token', data.token);
    localStorage.setItem('zh_user', JSON.stringify(data.user));
    $('#acc-new-email').placeholder = newEmail;
    $('#acc-new-email').value = '';
    $('#acc-email-pw').value = '';
    showToast('Email updated successfully', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Change Email';
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  const btn = $('#change-pw-btn');
  const currentPw = $('#acc-current-pw').value;
  const newPw = $('#acc-new-pw').value;
  const confirmPw = $('#acc-confirm-pw').value;

  if (!currentPw || !newPw || !confirmPw) {
    showToast('Please fill in all fields', 'error');
    return;
  }

  if (newPw.length < 8) {
    showToast('New password must be at least 8 characters', 'error');
    return;
  }

  if (newPw !== confirmPw) {
    showToast('New passwords do not match', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Updating...';

  try {
    await api('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    });
    showToast('Password changed successfully', 'success');
    $('#change-password-form').reset();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Change Password';
  }
}

function renderDangerous() {
  const el = $('#page-account');
  el.innerHTML = html`
    <div class="page-header" style="display:flex;align-items:center;gap:12px">
      <a href="/account" onclick="event.preventDefault();navigateTo('account')" style="color:var(--text-muted);display:flex;padding:4px;border-radius:var(--radius-sm);cursor:pointer">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </a>
      <div>
        <h1 class="page-title" style="margin:0">Dangerous Zone & Export Account Data</h1>
        <p class="page-subtitle" style="margin:0">Delete your account or export your personal data (RGPD)</p>
      </div>
    </div>
    <div class="account-grid">
      <div class="card" style="border-color:rgba(239,68,68,0.3)">
        <h2 class="card-title" style="margin-bottom:8px">Delete Account</h2>
        <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:20px;line-height:1.6">
          This action is irreversible. All your servers will be deleted and your account will be permanently removed.
        </p>
        <button class="btn btn-danger btn-full" id="delete-account-btn">Delete My Account</button>
      </div>

      <div class="card">
        <h2 class="card-title" style="margin-bottom:8px">Data Export (RGPD)</h2>
        <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:20px;line-height:1.6">
          Under Article 15 and 20 of the RGPD, you have the right to access and port your personal data. Click below to download a copy of all data we hold about you.
        </p>
        <button class="btn btn-primary btn-full" id="export-data-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Export My Data
        </button>
      </div>
    </div>
  `;
  $('#delete-account-btn').addEventListener('click', handleDeleteAccountClick);
  $('#export-data-btn').addEventListener('click', handleExportData);
}

function handleDeleteAccountClick() {
  const overlay = $('#modal-overlay');
  const content = $('#modal-content');
  content.innerHTML = html`
    <div class="modal-title">Delete Account</div>
    <p style="color:var(--text-secondary);line-height:1.6;margin-bottom:16px">
      This will permanently delete your account <strong style="color:var(--text-primary)">${state.user?.username || ''}</strong> and all associated servers. This cannot be undone.
    </p>
    <div class="form-group">
      <label for="delete-acc-pw">Enter your password to confirm</label>
      <input type="password" id="delete-acc-pw" placeholder="Your password" required />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost btn-full" id="modal-cancel-btn">Cancel</button>
      <button class="btn btn-danger btn-full" id="confirm-delete-acc-btn">Delete Forever</button>
    </div>
  `;
  overlay.classList.add('open');

  document.getElementById('confirm-delete-acc-btn').addEventListener('click', handleConfirmDeleteAccount);
}

async function handleConfirmDeleteAccount() {
  const password = $('#delete-acc-pw').value;
  if (!password) {
    showToast('Please enter your password', 'error');
    return;
  }

  const btn = $('#confirm-delete-acc-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Deleting...';

  try {
    await api('/auth/delete-account', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    $('#modal-overlay').classList.remove('open');
    showToast('Account deleted. Redirecting...', 'success');
    state.token = null;
    state.user = null;
    localStorage.removeItem('zh_token');
    localStorage.removeItem('zh_user');
    setTimeout(() => renderLoginPage(), 1500);
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = 'Delete Forever';
  }
}

// ===== SERVER DETAIL PAGE =====
async function renderServerDetail(serverId) {
  const el = $('#page-server-detail');

  try {
    const data = await api(`/servers/details/${serverId}`);
    const s = data.server;
    const meta = s.serverMeta;
    const eggName = s.eggDetails?.name || `Egg #${s.egg}`;
    const alloc = s.allocationDetails;
  const allocStr = alloc ? `${alloc.alias || alloc.nodeFqdn || alloc.ip}:${alloc.port}` : (s.nodeFqdn || `Node #${s.node}`);
    const isInstalling = s.status === 'installing' || s.installed === 0 || s.installed === '0' || s.installed === false;
    const isSuspended = s.status === 'suspended';
    const statusClass = isSuspended ? 'status-suspended' : (isInstalling ? 'status-installing' : 'status-active');
    const statusLabel = isSuspended ? 'Suspended' : (isInstalling ? 'Installing' : 'Active');
    const days = meta ? daysRemaining(meta.expires_at) : null;
    const canRenew = days !== null && days <= 7 && days >= -7;
    const expClass = days !== null && days <= 0 ? 'expired' : (days !== null && days <= 7 ? 'expiring' : '');

    const activeTab = state.serverDetailTab || 'info';

    el.innerHTML = html`
      <div class="page-header">
        <a href="/servers" onclick="navigateTo('servers')" class="btn btn-ghost btn-sm" style="margin-bottom:16px;display:inline-flex;width:auto">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Servers
        </a>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <h1 class="page-title" style="margin-bottom:0">${s.name}</h1>
          <button class="btn btn-ghost btn-sm btn-rename-server" data-server-id="${s.id}" data-server-name="${s.name.replace(/"/g, '&quot;')}" title="Rename server" style="width:auto;padding:6px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <span class="server-card-status ${statusClass}" style="font-size:0.8rem">${statusLabel}</span>
        </div>
      </div>

      <div class="tabs">
        <button class="tab ${activeTab === 'info' ? 'active' : ''}" data-tab="info">Info</button>
        <button class="tab ${activeTab === 'actions' ? 'active' : ''}" data-tab="actions">Actions</button>
      </div>

      <div id="server-tab-info" class="tab-content" style="display:${activeTab === 'info' ? 'block' : 'none'}">
        <div class="server-detail-grid">
          <div class="card">
            <h2 class="card-title" style="margin-bottom:16px">Server Info</h2>
            <div class="detail-list">
              <div class="detail-item"><span class="detail-label">Egg</span><span class="detail-value">${eggName}</span></div>
              <div class="detail-item"><span class="detail-label">Allocation</span><span class="detail-value">${allocStr}</span></div>
              <div class="detail-item"><span class="detail-label">Memory</span><span class="detail-value">${s.limits.memory > 0 ? s.limits.memory + ' MB' : 'Unlimited'}</span></div>
              <div class="detail-item"><span class="detail-label">Disk</span><span class="detail-value">${s.limits.disk > 0 ? s.limits.disk + ' MB' : 'Unlimited'}</span></div>
              <div class="detail-item"><span class="detail-label">CPU</span><span class="detail-value">${s.limits.cpu}%</span></div>
              <div class="detail-item"><span class="detail-label">IO</span><span class="detail-value">${s.limits.io}</span></div>
              <div class="detail-item"><span class="detail-label">Swap</span><span class="detail-value">${s.limits.swap > 0 ? s.limits.swap + ' MB' : 'Disabled'}</span></div>
              <div class="detail-item"><span class="detail-label">Identifier</span><span class="detail-value" style="font-family:monospace">${s.identifier}</span></div>
            </div>
          </div>

          <div class="card">
            <h2 class="card-title" style="margin-bottom:16px">Lifetime</h2>
            ${meta ? html`
              <div class="detail-list">
                <div class="detail-item"><span class="detail-label">Created</span><span class="detail-value">${formatDate(meta.created_at)}</span></div>
                <div class="detail-item ${expClass}"><span class="detail-label">Expires</span><span class="detail-value">${formatDate(meta.expires_at)} ${days !== null ? '(' + (days > 0 ? days + ' days' : 'Expired') + ')' : ''}</span></div>
                <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value" style="text-transform:capitalize">${meta.status}</span></div>
              </div>
              ${canRenew ? html`
                <button class="btn btn-primary btn-full btn-renew-server" data-server-id="${s.id}" style="margin-top:16px">Renew Server (90 days)</button>
              ` : html`
                ${days < -7 ? html`<p style="color:var(--accent-red);margin-top:12px;font-size:0.88rem">This server has expired. Contact support to renew.</p>` : ''}
                ${days > 7 ? html`<p style="color:var(--text-muted);margin-top:12px;font-size:0.88rem">Renewal available within 7 days of expiration.</p>` : ''}
              `}
            ` : html`
              <p style="color:var(--text-muted);font-size:0.88rem">No lifetime data available for this server.</p>
            `}
          </div>
        </div>
      </div>

      <div id="server-tab-actions" class="tab-content" style="display:${activeTab === 'actions' ? 'block' : 'none'}">
        <div class="action-card">
          <div class="action-card-header">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
            <div>
              <h3 class="action-card-title">Open Panel</h3>
              <p class="action-card-desc">Access the full Pterodactyl control panel to manage files, console, databases, schedules, and more.</p>
            </div>
          </div>
          <a href="https://panel.zero-host.org/server/${s.identifier}" target="_blank" class="btn btn-primary btn-full">Open Panel</a>
        </div>

        <div class="action-card">
          <div class="action-card-header">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>
            <div>
              <h3 class="action-card-title">Reinstall Server</h3>
              <p class="action-card-desc">Delete all files and reinstall the server from scratch. Only do this if you are experiencing critical issues with your server.</p>
            </div>
          </div>
          <button class="btn btn-warning btn-full btn-reinstall-server" data-server-id="${s.id}" data-server-name="${s.name.replace(/"/g, '&quot;')}">Reinstall Server</button>
        </div>

        <div class="action-card">
          <div class="action-card-header">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            <div>
              <h3 class="action-card-title">Delete Server</h3>
              <p class="action-card-desc">Permanently delete this server and all associated data. This action is irreversible.</p>
            </div>
          </div>
          <button class="btn btn-danger btn-full btn-delete-server" data-server-id="${s.id}" data-server-name="${s.name.replace(/"/g, '&quot;')}">Delete Server</button>
        </div>
      </div>
    `;

  } catch (err) {
    el.innerHTML = html`
      <div class="empty-state">
        <div class="empty-state-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg></div>
        <div class="empty-state-title">Server not found</div>
        <div class="empty-state-desc">${err.message}</div>
        <button class="btn btn-primary" onclick="navigateTo('servers')">Back to Servers</button>
      </div>
    `;
  }
}

// ===== DELETE SERVER =====
document.addEventListener('click', function(e) {
  const tabBtn = e.target.closest('.tab');
  if (tabBtn && !tabBtn.classList.contains('active')) {
    e.preventDefault();
    state.serverDetailTab = tabBtn.dataset.tab;
    renderServerDetail(state.serverId);
    return;
  }

  const renewBtn = e.target.closest('.btn-renew-server');
  if (renewBtn) {
    e.preventDefault();
    const serverId = parseInt(renewBtn.dataset.serverId);
    renewBtn.disabled = true;
    renewBtn.innerHTML = '<span class="spinner"></span>';

    api(`/servers/renew/${serverId}`, { method: 'POST' })
      .then(() => {
        showToast('Server renewed for another 90 days!', 'success');
        if (state.currentPage === 'overview') renderOverview();
        else if (state.currentPage === 'servers') renderServers();
      })
      .catch(err => {
        showToast(err.message, 'error');
        renewBtn.disabled = false;
        renewBtn.innerHTML = 'Renew';
      });
    return;
  }

  const renameBtn = e.target.closest('.btn-rename-server');
  if (renameBtn) {
    e.preventDefault();
    const serverId = parseInt(renameBtn.dataset.serverId);
    const serverName = renameBtn.dataset.serverName;
    const overlay = $('#modal-overlay');
    const content = $('#modal-content');
    content.innerHTML = html`
      <div class="modal-title">Rename Server</div>
      <p style="color:var(--text-secondary);line-height:1.6">
        Enter a new name for <strong style="color:var(--text-primary)">${serverName}</strong>.
      </p>
      <div class="form-group">
        <label for="rename-server-input">Server name</label>
        <input type="text" id="rename-server-input" value="${serverName}" maxlength="255" required />
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-full" id="modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary btn-full" id="confirm-rename-btn" data-server-id="${serverId}">Rename</button>
      </div>
    `;
    overlay.classList.add('open');
    const input = $('#rename-server-input');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    return;
  }

  const reinstallBtn = e.target.closest('.btn-reinstall-server');
  if (reinstallBtn) {
    e.preventDefault();
    const serverId = parseInt(reinstallBtn.dataset.serverId);
    const serverName = reinstallBtn.dataset.serverName;
    const overlay = $('#modal-overlay');
    const content = $('#modal-content');
    content.innerHTML = html`
      <div class="modal-title">Reinstall Server</div>
      <p style="color:var(--text-secondary);line-height:1.6">
        Are you sure you want to reinstall <strong style="color:var(--text-primary)">${serverName}</strong>?
      </p>
      <div class="alert" style="background:rgba(255,183,0,0.1);border:1px solid rgba(255,183,0,0.3);border-radius:8px;padding:12px;margin-bottom:12px">
        <p style="color:var(--text-primary);font-size:0.88rem;line-height:1.5">
          This will delete all files, configurations, and data on the server and reinstall it from scratch.
          Only do this if you are experiencing issues with the server.
        </p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-full" id="modal-cancel-btn">Cancel</button>
        <button class="btn btn-warning btn-full" id="confirm-reinstall-btn" data-server-id="${serverId}">Reinstall</button>
      </div>
    `;
    overlay.classList.add('open');
    return;
  }

  const delBtn = e.target.closest('.btn-delete-server');
  if (delBtn) {
    e.preventDefault();
    const serverId = parseInt(delBtn.dataset.serverId);
    const serverName = delBtn.dataset.serverName;
    const overlay = $('#modal-overlay');
    const content = $('#modal-content');
    content.innerHTML = html`
      <div class="modal-title">Delete Server</div>
      <p style="color:var(--text-secondary);line-height:1.6">
        Are you sure you want to delete <strong style="color:var(--text-primary)">${serverName}</strong>?
        This action is irreversible and will permanently remove the server.
      </p>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-full" id="modal-cancel-btn">Cancel</button>
        <button class="btn btn-danger btn-full" id="confirm-delete-btn" data-server-id="${serverId}">
          Delete Forever
        </button>
      </div>
    `;
    overlay.classList.add('open');
    return;
  }

  if (e.target.closest('#modal-cancel-btn') || e.target.closest('.modal-overlay') && !e.target.closest('.modal')) {
    $('#modal-overlay').classList.remove('open');
    return;
  }

  const confirmBtn = e.target.closest('#confirm-delete-btn');
  if (confirmBtn) {
    const serverId = parseInt(confirmBtn.dataset.serverId);
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spinner"></span> Deleting...';

    api(`/servers/${serverId}`, { method: 'DELETE' })
      .then(() => {
        $('#modal-overlay').classList.remove('open');
        showToast('Server deleted successfully', 'success');
        if (state.currentPage === 'overview') renderOverview();
        else if (state.currentPage === 'servers') renderServers();
        else navigateTo('servers');
      })
      .catch(err => {
        showToast(err.message, 'error');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Delete Forever';
      });
    return;
  }

  const confirmRenameBtn = e.target.closest('#confirm-rename-btn');
  if (confirmRenameBtn) {
    const serverId = parseInt(confirmRenameBtn.dataset.serverId);
    const input = $('#rename-server-input');
    const name = input.value.trim();
    if (!name) {
      showToast('Server name cannot be empty', 'error');
      input.focus();
      return;
    }
    confirmRenameBtn.disabled = true;
    confirmRenameBtn.innerHTML = '<span class="spinner"></span> Renaming...';

    api(`/servers/${serverId}`, { method: 'PATCH', body: JSON.stringify({ name }) })
      .then(() => {
        $('#modal-overlay').classList.remove('open');
        showToast('Server renamed successfully', 'success');
        renderServerDetail(serverId);
      })
      .catch(err => {
        showToast(err.message, 'error');
        confirmRenameBtn.disabled = false;
        confirmRenameBtn.innerHTML = 'Rename';
      });
    return;
  }

  const confirmReinstallBtn = e.target.closest('#confirm-reinstall-btn');
  if (confirmReinstallBtn) {
    const serverId = parseInt(confirmReinstallBtn.dataset.serverId);
    confirmReinstallBtn.disabled = true;
    confirmReinstallBtn.innerHTML = '<span class="spinner"></span> Reinstalling...';

    api(`/servers/${serverId}/reinstall`, { method: 'POST' })
      .then(() => {
        $('#modal-overlay').classList.remove('open');
        showToast('Server reinstall has been initiated', 'success');
        renderServerDetail(serverId);
      })
      .catch(err => {
        showToast(err.message, 'error');
        confirmReinstallBtn.disabled = false;
        confirmReinstallBtn.innerHTML = 'Reinstall';
      });
    return;
  }
});

// ===== RGPD: DATA EXPORT (Art. 15 & 20) =====
async function handleExportData() {
  const btn = $('#export-data-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Exporting...';

  try {
    const data = await api('/auth/export-data');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zerohost-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Data exported successfully', 'success');
  } catch (err) {
    showToast('Failed to export data: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Export My Data`;
  }
}

// ===== INIT =====
function init() {
  const token = localStorage.getItem('zh_token');
  if (token) {
    state.token = token;
    try {
      const user = JSON.parse(localStorage.getItem('zh_user'));
      if (user) state.user = user;
    } catch {}
    api('/servers/overview').then(() => renderDashboard()).catch(() => {
      renderDashboard();
    });
  } else {
    renderLoginPage();
  }
  renderCookieBanner();
}

init();

