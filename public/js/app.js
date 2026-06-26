const API_BASE = window.location.origin;

const state = {
  user: null,
  token: localStorage.getItem('zh_token'),
  currentPage: 'overview',
  servers: [],
  rgpdConsent: JSON.parse(localStorage.getItem('zh_rgpd_consent') || 'null'),
  serverDetailTab: 'info',
};

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
        We use cookies for authentication and security (Cap). No tracking or advertising cookies are used.
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

const PTERO_URL = 'https://ptero.zerohost.fr';

function openPyrodactylPanel(serverIdentifier) {
  const url = `${PTERO_URL}${serverIdentifier ? '/server/' + serverIdentifier : ''}`;
  window.open(url, '_blank');
}

async function sendPowerCommand(identifier, signal) {
  const btn = event?.target;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span>';
  }
  try {
    await api(`/servers/power/${identifier}`, { method: 'POST', body: JSON.stringify({ signal }) });
  } catch (err) {
    alert('Failed to send ' + signal + ' command: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = signal.charAt(0).toUpperCase() + signal.slice(1);
    }
  }
}

function $(sel) { return document.querySelector(sel); }
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
  return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
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



function showCapModal() {
  return new Promise((resolve) => {
    if (!customElements.get('cap-widget')) {
      resolve('');
      return;
    }

    const capApiEndpoint = 'https://cap.zero-host.org/f6c8171b08/';

    const overlay = document.createElement('div');
    overlay.className = 'cap-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'cap-modal';

    const widget = document.createElement('cap-widget');
    widget.setAttribute('data-cap-api-endpoint', capApiEndpoint);
    widget.setAttribute('theme', 'dark');

    modal.appendChild(widget);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(() => {
      const check = setInterval(() => {
        const hiddenInput = widget.querySelector('[name="cap-token"]');
        const token = widget.token || (hiddenInput && hiddenInput.value) || '';
        if (token) {
          clearInterval(check);
          overlay.classList.add('cap-modal-fadeout');
          setTimeout(() => {
            overlay.remove();
            resolve(token);
          }, 300);
        }
      }, 200);
    }, 100);
  });
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
            <label class="custom-checkbox">
              <input type="checkbox" id="reg-rgpd-consent" required />
              <span class="checkmark"></span>
            </label>
            <label for="reg-rgpd-consent">
              I agree to the privacy policy and consent to the processing of my personal data (email, username, IP address) for account management purposes. <span style="color:var(--accent-red)">*</span>
            </label>
          </div>
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
    const capToken = await showCapModal();
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: $('#login-email').value,
        password: $('#login-password').value,
        capToken,
      }),
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('zh_token', data.token);
    localStorage.setItem('zh_user', JSON.stringify(data.user));
    renderDashboard();
  } catch (err) {
    showError(e.target, err.message);
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
    const capToken = await showCapModal();
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: $('#reg-email').value,
        username: $('#reg-username').value,
        password: $('#reg-password').value,
        capToken,
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
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Create Account';
  }
}

let sidebarResizeInitialized = false;

function initSidebarResize() {
  const sidebar = $('#sidebar');
  const resizer = $('#sidebar-resizer');
  if (!sidebar || !resizer) return;
  if (sidebarResizeInitialized) return;
  sidebarResizeInitialized = true;

  if (localStorage.getItem('zh_sidebar_collapsed') === 'true') {
    sidebar.classList.add('collapsed');
    document.querySelector('.main-content').style.marginLeft = '';
  } else {
    const saved = localStorage.getItem('zh_sidebar_width');
    if (saved) {
      const w = parseInt(saved, 10);
      if (w >= 180 && w <= 600) {
        sidebar.style.width = w + 'px';
        sidebar.style.setProperty('--sidebar-w', w + 'px');
        document.querySelector('.main-content').style.marginLeft = w + 'px';
      }
    }
  }

  let startX, startW;

  function onMouseDown(e) {
    startX = e.clientX;
    startW = sidebar.getBoundingClientRect().width;
    sidebar.classList.add('resizing');
    document.documentElement.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    const w = Math.min(600, Math.max(180, startW + e.clientX - startX));
    sidebar.style.width = w + 'px';
    sidebar.style.setProperty('--sidebar-w', w + 'px');
    document.querySelector('.main-content').style.marginLeft = w + 'px';
  }

  function onMouseUp() {
    sidebar.classList.remove('resizing');
    document.documentElement.style.userSelect = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    const w = sidebar.getBoundingClientRect().width;
    localStorage.setItem('zh_sidebar_width', Math.round(w));
  }

  resizer.addEventListener('mousedown', onMouseDown);
}

function toggleSidebarCollapse() {
  const sidebar = $('#sidebar');
  const main = document.querySelector('.main-content');
  const wasCollapsed = sidebar.classList.contains('collapsed');
  if (!wasCollapsed) {
    sidebar.dataset.prevWidth = sidebar.style.width || sidebar.offsetWidth + 'px';
    sidebar.classList.add('collapsed');
    sidebar.style.width = '';
    main.style.marginLeft = '';
  } else {
    sidebar.classList.remove('collapsed');
    let prev = sidebar.dataset.prevWidth || localStorage.getItem('zh_sidebar_width');
    if (!prev) prev = '260px';
    if (!prev.endsWith('px')) prev += 'px';
    sidebar.style.width = prev;
    sidebar.style.setProperty('--sidebar-w', prev);
    main.style.marginLeft = prev;
  }
  localStorage.setItem('zh_sidebar_collapsed', !wasCollapsed);
  updateNavIndicator();
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
          <div class="nav-indicator" id="nav-indicator"></div>
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
          <a class="nav-item" href="https://hub.zero-host.org" target="_blank">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Links Hub
          </a>
          <a class="nav-item" href="${window.location.hostname === 'beta.zero-host.org' ? 'https://dashboard.zero-host.org' : 'https://beta.zero-host.org'}" target="_blank">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
            ${window.location.hostname === 'beta.zero-host.org' ? 'Switch to Stable' : 'Switch to Beta'}
          </a>
        </nav>
        <div class="sidebar-tooltip" id="sidebar-tooltip"></div>
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
          <div style="padding:4px 0 8px;text-align:center;font-size:0.7rem;color:var(--text-muted);letter-spacing:0.05em">v1.0.0</div>
        </div>
        <div class="sidebar-resizer" id="sidebar-resizer"></div>
      </aside>

      <button class="hamburger-toggle" id="hamburger-toggle" aria-label="Toggle menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
      </button>

      <main class="main-content">
        <div class="page active" id="page-overview"></div>
        <div class="page" id="page-servers"></div>
        <div class="page" id="page-create"></div>
        <div class="page" id="page-pyrodactyl"></div>
        <div class="page" id="page-account"></div>
        <div class="page" id="page-server-detail"></div>
        <div class="page" id="page-log"></div>
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

  $('#sidebar-logo-link').addEventListener('click', (e) => {
    e.preventDefault();
    toggleSidebarCollapse();
  });

  $('#hamburger-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  initSidebarResize();

  initSidebarTooltip();

  const page = window.location.pathname.replace('/', '') || 'overview';
  navigateTo(page);
}

function initSidebarTooltip() {
  const sidebar = $('#sidebar');
  const sidebarNav = document.querySelector('.sidebar-nav');
  const tooltip = document.getElementById('sidebar-tooltip');
  let tooltipTimer = null;
  let tooltipQuickMode = false;
  let currentItem = null;

  function showTooltipForItem(item) {
    const text = item.textContent.trim();
    if (!text) return;
    tooltip.textContent = text;
    const rect = item.getBoundingClientRect();
    tooltip.style.top = (rect.top + rect.height / 2) + 'px';
    tooltip.style.left = (rect.right + 10) + 'px';
    tooltip.classList.add('visible');
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
    clearTimeout(tooltipTimer);
    tooltipQuickMode = false;
    currentItem = null;
  }

  sidebarNav.addEventListener('mouseover', (e) => {
    const item = e.target.closest('.nav-item');
    if (!item) return;
    if (!sidebar.classList.contains('collapsed')) return;

    if (item !== currentItem) {
      clearTimeout(tooltipTimer);
      currentItem = item;

      if (tooltipQuickMode) {
        showTooltipForItem(item);
      } else {
        tooltipTimer = setTimeout(() => {
          showTooltipForItem(item);
          tooltipQuickMode = true;
        }, 3000);
      }
    }
  });

  sidebarNav.addEventListener('mouseleave', () => {
    if (tooltip.classList.contains('visible') || tooltipTimer) {
      hideTooltip();
    }
  });
}

function navigateTo(page) {
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
    else if (basePage === 'pyrodactyl') renderPyrodactyl();
    else if (basePage === 'account') {
      if (param === 'edit') renderAccountEdit();
      else if (param === 'links') renderAccountLinks();
      else if (param === 'dangerous') renderDangerous();
      else renderAccount();
    } else if (basePage === 'log') {
      renderLog();
    }
  }

  updateNavIndicator();

  if (window.innerWidth <= 768) {
    $('#sidebar').classList.remove('open');
  }
}

function updateNavIndicator() {
  const activeNav = document.querySelector('.nav-item.active');
  const indicator = document.getElementById('nav-indicator');
  if (activeNav && indicator) {
    indicator.style.top = activeNav.offsetTop + 'px';
    indicator.style.height = activeNav.offsetHeight + 'px';
    indicator.style.opacity = '1';
  } else if (indicator) {
    indicator.style.opacity = '0';
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
    else if (basePage === 'pyrodactyl') renderPyrodactyl();
    else if (basePage === 'account') {
      if (param === 'edit') renderAccountEdit();
      else if (param === 'links') renderAccountLinks();
      else if (param === 'dangerous') renderDangerous();
      else renderAccount();
    } else if (basePage === 'log') {
      renderLog();
    }
  }
  updateNavIndicator();
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

    renderActivity();
  } catch (err) {
    $('#recent-servers-list').innerHTML = html`
      <div style="text-align:center;padding:32px;color:var(--accent-red)">Failed to load: ${err.message}</div>
    `;
  }
}

let activityIcons = {
  server_created: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  server_renewed: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>',
  server_renamed: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  server_reinstalled: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>',
  server_deleted: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
  account_registered: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>',
  password_changed: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>',
  email_changed: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
  account_deleted: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4"/><circle cx="12" cy="18" r="1"/></svg>',
  api_key_updated: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
};

function formatRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 7) return days + 'd ago';
  return formatDate(dateStr);
}

function getActionLabel(action) {
  const labels = {
    server_created: 'Created server',
    server_renewed: 'Renewed server',
    server_renamed: 'Renamed server',
    server_reinstalled: 'Reinstalled server',
    server_deleted: 'Deleted server',
    account_registered: 'Account created',
    password_changed: 'Password changed',
    email_changed: 'Email changed',
    account_deleted: 'Account deleted',
    api_key_updated: 'API key updated',
  };
  return labels[action] || action;
}

async function renderLog(pageNum) {
  const el = $('#page-log');
  pageNum = pageNum || 1;
  const limit = 50;
  const offset = (pageNum - 1) * limit;

  el.innerHTML = html`
    <div class="page-header">
      <h1 class="page-title">Activity Log</h1>
      <p class="page-subtitle">All account activity</p>
    </div>
    <div class="card" style="margin-bottom:20px">
      <div id="log-list">
        <div style="text-align:center;padding:24px;color:var(--text-secondary)"><span class="spinner"></span> Loading...</div>
      </div>
    </div>
  `;

  try {
    const data = await api(`/activity?limit=${limit}&offset=${offset}`);
    const list = $('#log-list');

    if (data.activities.length === 0) {
      list.innerHTML = '<div class="activity-empty">No activity found.</div>';
      return;
    }

    const pageInfo = data.totalPages > 1 ? html`
      <div class="log-pagination">
        <button class="btn btn-ghost btn-sm" onclick="renderLog(${pageNum - 1})" ${pageNum <= 1 ? 'disabled' : ''}>Previous</button>
        <span class="log-pagination-info">Page ${data.page} of ${data.totalPages} (${data.total} total)</span>
        <button class="btn btn-ghost btn-sm" onclick="renderLog(${pageNum + 1})" ${pageNum >= data.totalPages ? 'disabled' : ''}>Next</button>
      </div>
    ` : '';

    list.innerHTML = html`
      ${pageInfo}
      <div class="activity-list">
        ${data.activities.map(a => html`
          <div class="activity-item">
            <div class="activity-icon activity-icon-${a.action}">${activityIcons[a.action] || ''}</div>
            <div class="activity-content">
              <div class="activity-action">${getActionLabel(a.action)}</div>
              <div class="activity-details">${a.details || ''}</div>
            </div>
            <div class="activity-time">${formatRelativeTime(a.created_at)}</div>
          </div>
        `).join('')}
      </div>
      ${pageInfo}
    `;
  } catch (err) {
    const list = $('#log-list');
    if (list) list.innerHTML = '<div class="activity-empty">Could not load activity log.</div>';
  }
}

async function renderActivity() {
  const el = $('#page-overview');
  let activitySection = $('#activity-section');

  if (!activitySection) {
    const card = el.querySelector('.card:last-child');
    const section = document.createElement('div');
    section.id = 'activity-section';
    section.className = 'card';
    section.style.marginTop = '20px';
    section.innerHTML = html`
      <div class="card-header">
        <h2 class="card-title">Recent Activity</h2>
      </div>
      <div id="activity-list"><div style="text-align:center;padding:24px;color:var(--text-secondary)"><span class="spinner"></span> Loading...</div></div>
    `;
    card.parentNode.insertBefore(section, card.nextSibling);
    activitySection = section;
  }

  try {
    const data = await api('/activity?limit=5');
    const list = $('#activity-list');

    if (data.activities.length === 0) {
      list.innerHTML = '<div class="activity-empty">No activity yet. Create a server to get started.</div>';
      return;
    }

    const showCount = Math.min(4, data.activities.length);
    const hasMore = data.total > 4;

    list.innerHTML = html`
      <div class="activity-list${hasMore ? ' activity-list-truncated' : ''}">
        ${data.activities.slice(0, showCount).map(a => html`
          <div class="activity-item">
            <div class="activity-icon activity-icon-${a.action}">${activityIcons[a.action] || ''}</div>
            <div class="activity-content">
              <div class="activity-action">${getActionLabel(a.action)}</div>
              <div class="activity-details">${a.details || ''}</div>
            </div>
            <div class="activity-time">${formatRelativeTime(a.created_at)}</div>
          </div>
        `).join('')}
        ${hasMore ? html`
          <div class="activity-more-overlay">
            <a class="btn btn-primary btn-sm" onclick="navigateTo('log')" style="width:auto">View all logs</a>
          </div>
        ` : ''}
      </div>
    `;
  } catch (err) {
    const list = $('#activity-list');
    if (list) list.innerHTML = '<div class="activity-empty">Could not load activity.</div>';
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
      </div>

      ${meta ? html`
        <div class="server-card-expiry ${expClass}">
          <span>Expires: ${formatDate(meta.expires_at)}</span>
          ${days !== null ? html`<span>(${days > 0 ? days + ' days' : 'Expired'})</span>` : ''}
        </div>
      ` : ''}
      <div class="server-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="openPyrodactylPanel('${s.identifier}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
          Open Panel
        </button>
        ${canRenew ? html`
          <button class="btn btn-primary btn-sm btn-renew-server" data-server-id="${s.id}">Renew</button>
        ` : ''}
      </div>
    </div>
  `;
}

function renderServerRow(s) {
  const eggName = s.eggDetails?.name || `Egg #${s.egg}`;
  const alloc = s.allocationDetails;
  const isInstalling = s.status === 'installing' || s.installed === 0 || s.installed === '0' || s.installed === false;
  const isSuspended = s.status === 'suspended';
  const powerState = s.currentState ? s.currentState.charAt(0).toUpperCase() + s.currentState.slice(1) : null;
  const statusClass = isSuspended ? 'status-suspended' : (isInstalling ? 'status-installing' : (powerState === 'Offline' ? 'status-offline' : 'status-active'));
  const statusLabel = isSuspended ? 'Suspended' : (isInstalling ? 'Installing' : (powerState || 'Active'));
  const allocStr = alloc ? `${alloc.alias || alloc.nodeFqdn || alloc.ip}:${alloc.port}` : (s.nodeFqdn || `Node #${s.node}`);
  const meta = s.serverMeta;
  const days = meta ? daysRemaining(meta.expires_at) : null;
  const canRenew = days !== null && days <= 7 && days >= -7;
  return html`
    <tr>
      <td><strong><a href="/server/${s.id}" onclick="event.preventDefault();navigateTo('server/${s.id}')" style="color:inherit;text-decoration:none">${s.name}</a></strong></td>
      <td><span class="server-detail-tag">${eggName}</span></td>
      <td><span class="server-detail-tag">${allocStr}</span></td>
      <td>
        <span class="server-card-status ${statusClass}">${statusLabel}</span>
      </td>
      <td>
        <div style="display:flex;gap:6px">
          <a class="btn btn-ghost btn-sm" href="/server/${s.id}" onclick="event.preventDefault();navigateTo('server/${s.id}')">Settings</a>
          <button class="btn btn-ghost btn-sm" onclick="openPyrodactylPanel('${s.identifier}')">Manage Pyrodactyl</button>
          ${canRenew ? html`
            <button class="btn btn-primary btn-sm btn-renew-server" data-server-id="${s.id}">Renew</button>
          ` : ''}
        </div>
      </td>
    </tr>
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
    <div class="servers-toolbar">
      <div class="search-wrapper">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" id="server-search-input" placeholder="Search servers..." autocomplete="off" />
      </div>
      <div class="filter-group" id="server-filters">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="active">Active</button>
        <button class="filter-btn" data-filter="suspended">Suspended</button>
        <button class="filter-btn" data-filter="installing">Installing</button>
      </div>
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

    function applyFilters() {
      const searchTerm = ($('#server-search-input')?.value || '').toLowerCase();
      const activeFilter = document.querySelector('.filter-btn.active')?.dataset?.filter || 'all';
      const searchWords = searchTerm.split(/\s+/).filter(Boolean);

      let filtered = data.servers;

      if (activeFilter !== 'all') {
        filtered = filtered.filter(s => {
          if (activeFilter === 'installing') return s.status === 'installing' || s.installed === 0 || s.installed === '0' || s.installed === false;
          if (activeFilter === 'active') return s.status !== 'suspended' && !(s.status === 'installing' || s.installed === 0 || s.installed === '0' || s.installed === false);
          return s.status === activeFilter;
        });
      }

      if (searchWords.length > 0) {
        filtered = filtered.filter(s => {
          const eggName = s.eggDetails?.name || `Egg #${s.egg}`;
          const searchable = [s.name, eggName, s.identifier || '', s.node?.toString() || ''].join(' ').toLowerCase();
          return searchWords.every(w => searchable.includes(w));
        });
      }

      $('#servers-table-body').innerHTML = filtered.map(s => renderServerRow(s)).join('');

      if (filtered.length === 0) {
        $('#servers-table-body').innerHTML = html`
          <tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-secondary)">No servers match your search.</td></tr>
        `;
      }
    }

    $('#server-search-input').addEventListener('input', applyFilters);

    document.querySelectorAll('#server-filters .filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#server-filters .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
      });
    });

    applyFilters();
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
        <div class="card" style="margin-top:20px;margin-bottom:24px;background:var(--bg-secondary)">
          <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px">Default resources</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <span class="server-detail-tag">512 MB RAM</span>
            <span class="server-detail-tag">50% CPU</span>
            <span class="server-detail-tag">3 GB Disk</span>
          </div>
        </div>
        <div style="width:100%">
          <cap-widget data-cap-api-endpoint="https://cap.zero-host.org/f6c8171b08/" theme="dark"></cap-widget>
        </div>
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

  try {
    const data = await api('/servers/eggs');
    eggCache = data.eggs;
    const dropdown = $('#custom-egg-dropdown');
    const nestLabels = { 5: 'Application', 6: 'Code', 7: 'Database' };
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
  } catch (err) {
    $('#custom-egg-label').textContent = 'Failed to load eggs';
    $('#custom-egg-trigger').disabled = true;
    showToast('Could not load eggs: ' + err.message, 'error');
  }
}

function handleEggChange() {
  const varsEl = $('#egg-variables');
  varsEl.innerHTML = '';
  const eggVal = $('#custom-egg-trigger').dataset.value;
  if (!eggVal) return;
  const [eggId, nestId] = eggVal.split(',').map(Number);
  const egg = eggCache.find(e => e.eggId === eggId && e.nestId === nestId);
  if (!egg || !egg.variables || egg.variables.length === 0) return;
  const userViewable = egg.variables.filter(v => v.userViewable !== 0);
  if (userViewable.length === 0) return;
  let htmlStr = '<div class="card" style="margin-top:20px;padding:20px"><h3 style="font-size:0.95rem;font-weight:700;margin-bottom:16px">Egg Variables</h3>';
  for (const v of userViewable) {
    const isEditable = v.userEditable !== 0;
    const desc = v.description ? `<p style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${v.description}</p>` : '';
    if (isEditable) {
      htmlStr += `<div class="form-group"><label for="egg-var-${v.envVariable}">${v.name}</label><input type="text" id="egg-var-${v.envVariable}" value="${v.defaultValue || ''}" placeholder="${v.name}" />${desc}</div>`;
    } else {
      htmlStr += `<div class="form-group"><label>${v.name}</label><input type="text" value="${v.defaultValue || ''}" disabled />${desc}</div>`;
    }
  }
  htmlStr += '</div>';
  varsEl.innerHTML = htmlStr;
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
  if (name.length < 1 || name.length > 255) {
    showToast('Server name must be between 1 and 255 characters', 'error');
    btn.disabled = false;
    btn.innerHTML = 'Create Server';
    return;
  }

  const [eggId, nestId] = eggVal.split(',').map(Number);
  const egg = eggCache.find(e => e.eggId === eggId && e.nestId === nestId);

  const environment = {};
  if (egg && egg.variables) {
    for (const v of egg.variables) {
      const input = document.getElementById(`egg-var-${v.envVariable}`);
      environment[v.envVariable] = input ? input.value.trim() : (v.defaultValue || '');
    }
  }

  try {
    const capToken = document.querySelector('[name="cap-token"]')?.value || '';
    await api('/servers/create', {
      method: 'POST',
      body: JSON.stringify({ name, nestId, eggId, environment, capToken }),
    });
    showToast(`Server "${name}" created successfully!`, 'success');
    navigateTo('servers');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Create Server';
  }
}

// ===== PYRODACTYL PAGE =====
function renderPyrodactyl() {
  const el = $('#page-pyrodactyl');
  el.innerHTML = html`
    <div class="page-header">
      <h1 class="page-title">Pyrodactyl Panel</h1>
      <p class="page-subtitle">Access your Pyrodactyl panel</p>
    </div>
    <div class="ptero-grid">
      <div class="card ptero-card">
        <div class="ptero-card-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M9 6V5a2 2 0 012-2h2a2 2 0 012 2v1M9 12h6M9 16h4"/></svg>
        </div>
        <h2 class="ptero-card-title">Opening Pyrodactyl...</h2>
        <p class="ptero-card-desc">
          Click the button below to open the Pyrodactyl panel.
        </p>
        <button class="btn btn-primary btn-full" id="ptero-open-btn" onclick="openPyrodactylPanel()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
          Open Panel Now
        </button>
      </div>
    </div>
  `;
  setTimeout(() => openPyrodactylPanel(), 500);
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

      <div class="card account-menu-card" id="account-menu-logs" style="cursor:pointer">
        <div class="account-menu-item">
          <div class="account-menu-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </div>
          <div class="account-menu-text">
            <div class="account-menu-title">Activity Log</div>
            <div class="account-menu-desc">View all account activity</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>

      <div class="card account-menu-card" id="account-menu-logout" style="cursor:pointer">
        <div class="account-menu-item">
          <div class="account-menu-icon" style="color:var(--accent-red)">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          </div>
          <div class="account-menu-text">
            <div class="account-menu-title">Sign Out</div>
            <div class="account-menu-desc">Logout from your account</div>
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
  $('#account-menu-logs').addEventListener('click', () => navigateTo('log'));
  $('#account-menu-dangerous').addEventListener('click', () => navigateTo('account/dangerous'));
  $('#account-menu-logout').addEventListener('click', async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    state.token = null;
    state.user = null;
    localStorage.removeItem('zh_token');
    localStorage.removeItem('zh_user');
    renderLoginPage();
  });
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

      <div class="card">
        <h2 class="card-title" style="margin-bottom:20px">Pyrodactyl API Key</h2>
        <p style="color:var(--text-secondary);font-size:0.85rem;line-height:1.6;margin-bottom:16px">
          Add your Pyrodactyl Client API key to enable live resource monitoring and server power state detection directly in the dashboard.
          Generate one at <a href="https://panel.zero-host.org/account/api" target="_blank">panel.zero-host.org/account/api</a>.
        </p>
        <form id="api-key-form" style="max-width:480px">
          <div class="form-group">
            <label for="ptero-api-key-input">API Key</label>
            <input type="password" id="ptero-api-key-input" placeholder="ptla_..." autocomplete="off" />
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="save-api-key-btn">Save</button>
        </form>
        <div id="api-key-status" style="margin-top:8px;font-size:0.82rem;color:var(--text-muted)"></div>
      </div>
    </div>
  `;

  $('#change-email-form').addEventListener('submit', handleChangeEmail);
  $('#change-password-form').addEventListener('submit', handleChangePassword);
  $('#api-key-form').addEventListener('submit', handleSaveApiKey);
}

async function handleSaveApiKey(e) {
  e.preventDefault();
  const btn = $('#save-api-key-btn');
  const input = $('#ptero-api-key-input');
  const status = $('#api-key-status');
  const key = input.value.trim();

  if (!key) {
    status.textContent = 'Please enter an API key.';
    status.style.color = 'var(--accent-red)';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  status.textContent = '';

  try {
    await api('/servers/client-api-key', {
      method: 'PUT',
      body: JSON.stringify({ apiKey: key }),
    });
    status.textContent = 'API key saved successfully!';
    status.style.color = 'var(--accent-green)';
    input.value = '';
    showToast('Pyrodactyl API key saved', 'success');
  } catch (err) {
    status.textContent = err.message;
    status.style.color = 'var(--accent-red)';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Save';
  }
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
    <div class="card" style="margin-bottom:20px">
      <p style="color:var(--text-secondary);font-size:0.85rem;line-height:1.6;margin:0">
        No account linking system is currently active due to the complexity
        of maintaining it both on the dashboard and the Pyrodactyl panel. This is why
        we have removed account creation and login via Discord. Perhaps this will
        return later.
      </p>
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
      <button class="btn btn-ghost btn-full" class="modal-cancel-btn">Cancel</button>
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
        <a href="/servers" onclick="event.preventDefault();navigateTo('servers')" class="btn btn-ghost btn-sm" style="margin-bottom:16px;display:inline-flex;width:auto">
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

      <div class="tabs" id="server-detail-tabs">
        <button class="tab ${activeTab === 'info' ? 'active' : ''}" data-tab="info">Info</button>
        <button class="tab ${activeTab === 'resources' ? 'active' : ''}" data-tab="resources">Resources</button>
        <button class="tab ${activeTab === 'actions' ? 'active' : ''}" data-tab="actions">Actions</button>
        <div class="tab-indicator" id="tab-indicator"></div>
      </div>

      <div id="server-tab-info" class="tab-content" style="display:${activeTab === 'info' ? 'block' : 'none'}">
        <div class="server-detail-grid">
          <div class="card">
            <h2 class="card-title" style="margin-bottom:16px">Server Info</h2>
            <div class="detail-list">
              <div class="detail-item"><span class="detail-label">Egg</span><span class="detail-value">${eggName}</span></div>
              <div class="detail-item"><span class="detail-label">Allocation</span><span class="detail-value">${allocStr}</span></div>
              <div class="detail-item"><span class="detail-label">IO</span><span class="detail-value">${s.limits.io}</span></div>
              <div class="detail-item"><span class="detail-label">Swap</span><span class="detail-value">${s.limits.swap > 0 ? s.limits.swap + ' MB' : 'Disabled'}</span></div>
              <div class="detail-item"><span class="detail-label">Identifier</span><span class="detail-value" style="font-family:monospace">${s.identifier}</span></div>
            </div>
          </div>

          <div class="card" id="server-resources-card">
            <h2 class="card-title" style="margin-bottom:16px">Resources</h2>
            <div class="resource-gauges">
              <div class="resource-gauge">
                <div class="resource-gauge-value" style="color:var(--accent-1)">${s.limits.memory > 0 ? s.limits.memory + ' MB' : '∞'}</div>
                <div class="resource-gauge-label">Memory</div>
                <div class="resource-gauge-bar"><div class="resource-gauge-fill" style="width:${s.limits.memory > 0 ? Math.min(100, (s.limits.memory / 512) * 100) : 100}%;background:linear-gradient(90deg,#ee8132,#f59e0b)"></div></div>
                <div class="resource-gauge-sub">${s.limits.memory > 0 ? '512 MB max' : 'No limit'}</div>
              </div>
              <div class="resource-gauge">
                <div class="resource-gauge-value" style="color:var(--accent-cyan)">${s.limits.cpu}%</div>
                <div class="resource-gauge-label">CPU</div>
                <div class="resource-gauge-bar"><div class="resource-gauge-fill" style="width:${s.limits.cpu}%;background:linear-gradient(90deg,#06b6d4,#3b82f6)"></div></div>
                <div class="resource-gauge-sub">50% max</div>
              </div>
              <div class="resource-gauge">
                <div class="resource-gauge-value" style="color:var(--accent-green)">${s.limits.disk > 0 ? (s.limits.disk / 1024).toFixed(1) + ' GB' : '∞'}</div>
                <div class="resource-gauge-label">Disk</div>
                <div class="resource-gauge-bar"><div class="resource-gauge-fill" style="width:${s.limits.disk > 0 ? Math.min(100, (s.limits.disk / 3072) * 100) : 100}%;background:linear-gradient(90deg,#059669,#10b981)"></div></div>
                <div class="resource-gauge-sub">3 GB max</div>
              </div>
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

      <div id="server-tab-resources" class="tab-content" style="display:${activeTab === 'resources' ? 'block' : 'none'}">
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <h2 class="card-title" style="margin:0">Live Resource Usage</h2>
            <button class="btn btn-ghost btn-sm" id="refresh-resources-btn" style="width:auto">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>
              Refresh
            </button>
          </div>
          <div id="live-resources-container">
            <div style="text-align:center;padding:32px;color:var(--text-secondary)" id="live-resources-loading"><span class="spinner"></span> Fetching live data...</div>
          </div>
        </div>
      </div>

      <div id="server-tab-actions" class="tab-content" style="display:${activeTab === 'actions' ? 'block' : 'none'}">
        <div class="action-card">
          <div class="action-card-header">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            <div>
              <h3 class="action-card-title">Power Controls</h3>
              <p class="action-card-desc">
                Current state: <strong>${s.currentState || 'Unknown'}</strong>
              </p>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-success btn-full" style="flex:1" onclick="sendPowerCommand('${s.identifier}','start')" ${s.currentState === 'running' ? 'disabled' : ''}>Start</button>
            <button class="btn btn-warning btn-full" style="flex:1" onclick="sendPowerCommand('${s.identifier}','stop')" ${s.currentState !== 'running' ? 'disabled' : ''}>Stop</button>
            <button class="btn btn-ghost btn-full" style="flex:1" onclick="sendPowerCommand('${s.identifier}','restart')" ${s.currentState !== 'running' ? 'disabled' : ''}>Restart</button>
          </div>
        </div>

        <div class="action-card">
          <div class="action-card-header">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
            <div>
              <h3 class="action-card-title">Open Panel</h3>
              <p class="action-card-desc">Access the full Pyrodactyl control panel to manage files, console, databases, schedules, and more.</p>
            </div>
          </div>
          <button class="btn btn-primary btn-full" onclick="openPyrodactylPanel('${s.identifier}')">Open Panel</button>
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

    if (activeTab === 'resources') {
      fetchLiveResources(s.identifier);
    }

    requestAnimationFrame(() => {
      const indicator = $('#tab-indicator');
      const activeTabEl = $('#server-detail-tabs .tab.active');
      if (indicator && activeTabEl) {
        indicator.style.left = activeTabEl.offsetLeft + 'px';
        indicator.style.width = activeTabEl.offsetWidth + 'px';
      }
    });

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

async function fetchLiveResources(identifier) {
  const container = $('#live-resources-container');
  if (!container) return;

  try {
    const data = await api(`/servers/resources/${identifier}`);

    if (!data.resources) {
      container.innerHTML = html`
        <div class="empty-state" style="padding:24px">
          <div class="empty-state-title" style="font-size:0.95rem">No live data</div>
          <div class="empty-state-desc" style="font-size:0.82rem">
            ${data.error || 'Add your Pyrodactyl API key in Account → Linked Accounts to enable live monitoring.'}
          </div>
          <button class="btn btn-primary btn-sm" onclick="navigateTo('account/edit')" style="margin-top:8px;width:auto">Configure API Key</button>
        </div>
      `;
      return;
    }

    const res = data.resources;
    const currentState = data.current_state;
    const cpuPct = Math.round(res.cpu_absolute || 0);
    const memUsed = res.memory_bytes ? Math.round(res.memory_bytes / (1024 * 1024)) : 0;
    const memLimit = res.memory_limit_bytes ? Math.round(res.memory_limit_bytes / (1024 * 1024)) : 512;
    const memPct = memLimit > 0 ? Math.min(100, Math.round((memUsed / memLimit) * 100)) : 0;
    const diskUsed = res.disk_bytes ? Math.round(res.disk_bytes / (1024 * 1024)) : 0;
    const diskLimit = 3072;
    const diskPct = diskLimit > 0 ? Math.min(100, Math.round((diskUsed / diskLimit) * 100)) : 0;

    function usageClass(pct) {
      if (pct >= 80) return 'usage-high';
      if (pct >= 50) return 'usage-mid';
      return 'usage-low';
    }

    container.innerHTML = html`
      <div class="resource-gauges">
        <div class="resource-gauge">
          <div class="resource-gauge-value" style="color:${cpuPct >= 80 ? 'var(--accent-red)' : cpuPct >= 50 ? 'var(--accent-orange)' : 'var(--accent-cyan)'}">${cpuPct}%</div>
          <div class="resource-gauge-label">CPU</div>
          <div class="resource-gauge-bar"><div class="resource-gauge-fill ${usageClass(cpuPct)}" style="width:${cpuPct}%"></div></div>
          <div class="resource-gauge-sub">${cpuPct >= 80 ? 'High load' : cpuPct >= 50 ? 'Moderate' : 'Idle'}</div>
        </div>
        <div class="resource-gauge">
          <div class="resource-gauge-value" style="color:${memPct >= 80 ? 'var(--accent-red)' : memPct >= 50 ? 'var(--accent-orange)' : 'var(--accent-1)'}">${memUsed} / ${memLimit} MB</div>
          <div class="resource-gauge-label">Memory</div>
          <div class="resource-gauge-bar"><div class="resource-gauge-fill ${usageClass(memPct)}" style="width:${memPct}%"></div></div>
          <div class="resource-gauge-sub">${memPct}% used</div>
        </div>
        <div class="resource-gauge">
          <div class="resource-gauge-value" style="color:${diskPct >= 80 ? 'var(--accent-red)' : diskPct >= 50 ? 'var(--accent-orange)' : 'var(--accent-green)'}">${(diskUsed / 1024).toFixed(1)} / ${(diskLimit / 1024).toFixed(1)} GB</div>
          <div class="resource-gauge-label">Disk</div>
          <div class="resource-gauge-bar"><div class="resource-gauge-fill ${usageClass(diskPct)}" style="width:${diskPct}%"></div></div>
          <div class="resource-gauge-sub">${diskPct}% used</div>
        </div>
      </div>
      <div style="margin-top:12px;text-align:center;font-size:0.72rem;color:var(--text-muted)">
        Updated ${formatRelativeTime(new Date().toISOString())} · 
        ${currentState ? html`Status: <strong>${currentState}</strong>` : ''}
      </div>
    `;

    const refreshBtn = $('#refresh-resources-btn');
    if (refreshBtn && !refreshBtn.dataset.listenerAttached) {
      refreshBtn.dataset.listenerAttached = '1';
      refreshBtn.addEventListener('click', () => {
        container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-secondary)" id="live-resources-loading"><span class="spinner"></span> Fetching live data...</div>';
        fetchLiveResources(identifier);
      });
    }

  } catch (err) {
    if (container) {
      container.innerHTML = html`
        <div style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.88rem">
          Could not load live resources: ${err.message}
        </div>
      `;
    }
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
        <button class="btn btn-ghost btn-full" class="modal-cancel-btn">Cancel</button>
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
        <button class="btn btn-ghost btn-full" class="modal-cancel-btn">Cancel</button>
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
        <button class="btn btn-ghost btn-full" class="modal-cancel-btn">Cancel</button>
        <button class="btn btn-danger btn-full" id="confirm-delete-btn" data-server-id="${serverId}">
          Delete Forever
        </button>
      </div>
    `;
    overlay.classList.add('open');
    return;
  }

  if (e.target.closest('.modal-cancel-btn') || e.target.closest('.modal-overlay') && !e.target.closest('.modal')) {
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

