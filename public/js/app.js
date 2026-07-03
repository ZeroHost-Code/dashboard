function initIcons() { if (window.lucide) lucide.createIcons(); }

const API_BASE = window.location.origin;

const state = {
  user: null,
  token: localStorage.getItem('zh_token'),
  currentPage: 'overview',
  servers: [],
  rgpdConsent: JSON.parse(localStorage.getItem('zh_rgpd_consent') || 'null'),
  serverDetailTab: 'info',
  notifications: [],
  unreadCount: 0,
  notifPanelOpen: false,
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

const PTERO_URL = 'https://panel.zero-host.org';

function openPyrodactylPanel(serverIdentifier) {
  const url = `${PTERO_URL}${serverIdentifier ? '/server/' + serverIdentifier : ''}`;
  window.open(url, '_blank');
}

async function sendPowerCommand(identifier, signal, event) {
  const btn = event?.target;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span>';
  }
  try {
    await api(`/servers/power/${identifier}`, { method: 'POST', body: JSON.stringify({ signal }) });
  } catch (err) {
    const overlay = $('#modal-overlay');
    const content = $('#modal-content');
    content.innerHTML = html`
      <div class="modal-title">Command Failed</div>
      <div style="text-align:center;padding:8px 0 16px">
        <i data-lucide="circle-alert" style="width:48px;height:48px;color:var(--accent-red);margin-bottom:12px"></i>
        <p style="color:var(--text-secondary);line-height:1.6;margin:0">Failed to send ${signal} command:</p>
        <p style="color:var(--text-primary);font-weight:600;margin:4px 0 0 0">${err.message}</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary btn-full modal-cancel-btn">OK</button>
      </div>
    `;
    overlay.classList.add('open');
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

function avatarUrl(userId) {
  return `${API_BASE}/api/auth/avatar/${userId}`;
}

window.handleAvatarError = function(img) {
  if (!img.dataset.fallbackTried) {
    img.dataset.fallbackTried = 'gravatar';
    img.src = gravatarUrl(state.user?.email, 32);
  } else {
    img.style.display = 'none';
    const fallback = document.getElementById('avatar-fallback');
    if (fallback) fallback.style.display = 'flex';
  }
};

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
  return str.replace(/[&<>"']/g, m => map[m]);
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
    navigateTo('login');
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

const NOTIF_ICONS = {
  success: '<i data-lucide="check-circle" class="notif-icon"></i>',
  error: '<i data-lucide="x-circle" class="notif-icon"></i>',
  warning: '<i data-lucide="triangle-alert" class="notif-icon"></i>',
  info: '<i data-lucide="info" class="notif-icon"></i>',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 7) return days + 'd ago';
  return new Date(dateStr).toLocaleDateString();
}

async function fetchUnreadCount() {
  try {
    const data = await api('/notifications/unread-count');
    state.unreadCount = data.count;
    updateNotifBadge();
  } catch {}
}

async function fetchNotifications() {
  try {
    const data = await api('/notifications');
    state.notifications = data.notifications;
    renderNotifications();
  } catch {}
}

function showNotifDetailModal(notif) {
  const existing = $('#notif-view-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'notif-view-modal';
  overlay.id = 'notif-view-modal';
  overlay.innerHTML = html`
    <div class="notif-view-modal-content" onclick="event.stopPropagation()">
      <div class="notif-view-modal-header">
        <h3>${escapeHtml(notif.title)}</h3>
        <button class="notif-view-modal-close" id="notif-view-modal-close-btn">
          <i data-lucide="x" style="width:20px;height:20px"></i>
        </button>
      </div>
      <div class="notif-view-modal-body">${escapeHtml(notif.message)}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add('open');
  });

  overlay.addEventListener('click', closeNotifDetailModal);
  $('#notif-view-modal-close-btn')?.addEventListener('click', closeNotifDetailModal);

  initIcons();
}

function closeNotifDetailModal() {
  const overlay = $('#notif-view-modal');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => overlay.remove(), 200);
}

function renderNotifications() {
  const list = $('#notif-panel-list');
  if (!list) return;
  if (state.notifications.length === 0) {
    list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }
  list.innerHTML = state.notifications.map(n => html`
    <div class="notif-item ${n.is_read ? '' : 'notif-unread'}" data-id="${n.id}">
      <div class="notif-item-icon notif-${n.type}">${NOTIF_ICONS[n.type] || NOTIF_ICONS.info}</div>
      <div class="notif-item-body">
        <div class="notif-item-title">${escapeHtml(n.title)}</div>
        <div class="notif-item-msg">${escapeHtml(n.message)}</div>
        <div class="notif-item-time">${timeAgo(n.created_at)}</div>
      </div>
      ${n.is_read ? '' : '<div class="notif-dot"></div>'}
    </div>
  `).join('');

  list.querySelectorAll('.notif-item').forEach(el => {
    const msgEl = el.querySelector('.notif-item-msg');
    const isTruncated = msgEl && msgEl.scrollHeight > msgEl.clientHeight;

    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.id, 10);
      if (el.classList.contains('notif-unread')) {
        markAsRead(id);
      }
      if (isTruncated) {
        const notif = state.notifications.find(n => n.id === id);
        if (notif) showNotifDetailModal(notif);
      }
    });
  });
  initIcons();
}

async function markAsRead(id) {
  try {
    await api('/notifications/' + id + '/read', { method: 'PATCH' });
    const notif = state.notifications.find(n => n.id === id);
    if (notif) notif.is_read = 1;
    state.unreadCount = Math.max(0, state.unreadCount - 1);
    updateNotifBadge();
    renderNotifications();
  } catch {}
}

async function markAllAsRead() {
  try {
    await api('/notifications/read-all', { method: 'PATCH' });
    state.notifications.forEach(n => n.is_read = 1);
    state.unreadCount = 0;
    updateNotifBadge();
    renderNotifications();
  } catch {}
}

function updateNotifBadge() {
  const badge = $('#notif-badge');
  if (!badge) return;
  if (state.unreadCount > 0) {
    badge.textContent = state.unreadCount > 99 ? '99+' : state.unreadCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function toggleNotifPanel() {
  if (state.notifPanelOpen) {
    closeNotifPanel();
  } else {
    openNotifPanel();
  }
}

function openNotifPanel() {
  state.notifPanelOpen = true;
  $('#notif-panel').classList.add('open');
  $('#notif-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $('#nav-notifications').classList.add('active');
  updateNavIndicator();

  fetchNotifications();
  if (state.unreadCount > 0) {
    fetchUnreadCount();
  }
}

function closeNotifPanel() {
  state.notifPanelOpen = false;
  $('#notif-panel').classList.remove('open');
  $('#notif-backdrop').classList.remove('open');
  document.body.style.overflow = '';

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const targetNav = document.querySelector(`.nav-item[data-page="${state.currentPage}"]`);
  if (targetNav) targetNav.classList.add('active');
  updateNavIndicator();
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
          <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
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
          Don't have an account? <a href="/signup" id="go-register">Create one</a>
        </div>
      </div>
    </div>
  `;

  $('#login-form').addEventListener('submit', handleLogin);
  $('#go-register').addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('signup');
  });
}

function renderRegisterPage() {
  const app = $('#app');
  app.innerHTML = html`
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
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
          Already have an account? <a href="/login" id="go-login">Sign in</a>
        </div>
      </div>
    </div>
  `;

  $('#register-form').addEventListener('submit', handleRegister);
  $('#go-login').addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('login');
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
    history.replaceState({ page: 'overview' }, '', '/');
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
    history.replaceState({ page: 'overview' }, '', '/');
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
        document.documentElement.style.setProperty('--sidebar-w', w + 'px');
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
    document.documentElement.style.setProperty('--sidebar-w', w + 'px');
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
    document.documentElement.style.setProperty('--sidebar-w', prev);
    main.style.marginLeft = prev;
  }
  localStorage.setItem('zh_sidebar_collapsed', !wasCollapsed);
  updateNavIndicator();
}

// ===== DASHBOARD =====
async function renderDashboard() {
  if (typeof adminTakingOver !== 'undefined' && adminTakingOver) return;
  const app = $('#app');
  app.innerHTML = html`
    <div class="dashboard-layout">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <a href="#" class="sidebar-logo" id="sidebar-logo-link">
            <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
            <span class="sidebar-logo-text">Zero<span style="color:var(--accent-3)">Host</span></span>
          </a>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-indicator" id="nav-indicator"></div>
          <div class="nav-section-label">Main</div>
          <a class="nav-item active" data-page="overview" href="/">
            <i data-lucide="grid-3x3"></i>
            Overview
          </a>
          <a class="nav-item" data-page="servers" href="/servers">
            <i data-lucide="server"></i>
            My Servers
          </a>
          <a class="nav-item" id="nav-notifications" href="#">
            <span style="position:relative;display:inline-flex">
              <i data-lucide="bell"></i>
              <span class="notif-badge" id="notif-badge"></span>
            </span>
            Notifications
          </a>
          <div class="nav-section-label">Actions</div>
          <a class="nav-item" data-page="create" href="/create">
            <i data-lucide="plus"></i>
            Create Server
          </a>
          <div class="nav-section-label">Links</div>
          <a class="nav-item" href="https://hub.zero-host.org" target="_blank">
            <i data-lucide="globe"></i>
            Links Hub
          </a>
          <a class="nav-item" href="${window.location.hostname === 'beta.zero-host.org' ? 'https://dashboard.zero-host.org' : 'https://beta.zero-host.org'}" target="_blank">
            <i data-lucide="globe"></i>
            ${window.location.hostname === 'beta.zero-host.org' ? 'Switch to Stable' : 'Switch to Beta'}
          </a>
          ${state.user?.isAdmin ? html`
          <a class="nav-item" href="/admin">
            <i data-lucide="shield"></i>
            Switch Admin
          </a>
          ` : ''}
        </nav>
        <div class="sidebar-tooltip" id="sidebar-tooltip"></div>
        <div class="sidebar-footer">
          <div class="user-info" id="sidebar-user-info" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="user-avatar" id="avatar-container"><img src="${avatarUrl(state.user?.id)}" alt="" width="32" height="32" style="border-radius:50%;width:32px;height:32px;object-fit:cover" onerror="handleAvatarError(this)"/><span id="avatar-fallback" style="display:none">${state.user?.username?.[0]?.toUpperCase() || 'U'}</span></div>
              <div>
                <div class="user-name">${state.user?.username || 'User'}</div>
                <div class="user-email">${state.user?.email || ''}</div>
              </div>
            </div>
            <div id="logout-btn" style="cursor:pointer;color:var(--text-muted);display:flex;align-items:center;padding:6px;border-radius:var(--radius-sm);transition:all var(--transition)" title="Sign Out">
              <i data-lucide="log-out" style="width:18px;height:18px"></i>
            </div>
          </div>
          <div style="border-top:1px solid var(--border);margin:6px -12px 0"></div>
          <div style="padding:8px 12px 0;display:flex;gap:16px;justify-content:center;flex-wrap:wrap">

          </div>
          <div style="padding:4px 0 8px;text-align:center;font-size:0.7rem;color:var(--text-muted);letter-spacing:0.05em">v1.0.3</div>
        </div>
        <div class="sidebar-resizer" id="sidebar-resizer"></div>
      </aside>

      <div class="notif-panel" id="notif-panel">
        <div class="notif-panel-header">
          <h3>Notifications</h3>
          <button class="notif-mark-all" id="notif-mark-all">Mark all read</button>
        </div>
        <div class="notif-panel-list" id="notif-panel-list">
          <div class="notif-empty">No notifications yet</div>
        </div>
      </div>
      <div class="notif-backdrop" id="notif-backdrop"></div>

      <button class="hamburger-toggle" id="hamburger-toggle" aria-label="Toggle menu">
        <i data-lucide="menu" style="width:20px;height:20px"></i>
      </button>

      <main class="main-content">
        <div id="restricted-banner" style="display:${state.user?.restricted ? 'flex' : 'none'};align-items:center;justify-content:center;gap:8px;background:rgba(239,68,68,0.12);color:var(--accent-red);padding:12px 20px;font-size:0.875rem;text-align:center;border:2px solid rgba(239,68,68,0.25);border-radius:10px;margin:8px 16px 0">
          <i data-lucide="triangle-alert" style="width:18px;height:18px;flex-shrink:0"></i>
          <span><strong>Account Restricted</strong> &mdash; Your account has been restricted. You cannot create or renew servers.</span>
        </div>
        <div class="page active" id="page-overview"></div>
        <div class="page" id="page-servers"></div>
        <div class="page" id="page-create"></div>
        <div class="page" id="page-pyrodactyl"></div>
        <div class="page" id="page-account"></div>
        <div class="page" id="page-server-detail"></div>
        <div class="page" id="page-logs"></div>
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
    navigateTo('login');
  });

  $('#sidebar-user-info').addEventListener('click', (e) => {
    if (e.target.closest('#logout-btn')) return;
    navigateTo('account');
  });

  $('#nav-notifications').addEventListener('click', (e) => {
    e.preventDefault();
    toggleNotifPanel();
  });

  $('#notif-backdrop').addEventListener('click', closeNotifPanel);

  $('#notif-mark-all').addEventListener('click', markAllAsRead);

  $('#sidebar-logo-link').addEventListener('click', (e) => {
    e.preventDefault();
    toggleSidebarCollapse();
  });

  $('#hamburger-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  initSidebarResize();

  initSidebarTooltip();

  initIcons();

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
        }, 700);
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
  if (state.notifPanelOpen) closeNotifPanel();
  const parts = page.split('/');
  let basePage = parts[0] || 'overview';
  const param = parts[1];
  const tab = parts[2];

  // Auth pages - redirect to / if already logged in
  if ((basePage === 'login' || basePage === 'signup') && state.token) {
    basePage = 'overview';
  }

  // Handle auth pages (no dashboard needed)
  if (basePage === 'login') {
    renderLoginPage();
    history.pushState({ page: 'login' }, '', '/login');
    return;
  }
  if (basePage === 'signup') {
    renderRegisterPage();
    history.pushState({ page: 'signup' }, '', '/signup');
    return;
  }

  // Auth guard: require valid token for all other pages
  if (!state.token) {
    renderLoginPage();
    history.pushState({ page: 'login' }, '', '/login');
    return;
  }

  // Ensure dashboard layout exists
  if (!document.querySelector('.dashboard-layout')) {
    renderDashboard();
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  state.currentPage = basePage;
  state.serverId = param ? parseInt(param) : null;
  state.serverDetailTab = tab || 'info';
  const url = basePage === 'overview' && !param ? '/' : `/${page}`;
  history.pushState({ page: basePage, serverId: state.serverId }, '', url);

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
    else if (basePage === 'create') {
      const el = $('#page-create');
      el.innerHTML = html`
        <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <h1 class="page-title">Create Server</h1>
            <p class="page-subtitle">Deploy a new server in minutes</p>
          </div>
        </div>
        <div id="create-wizard"></div>
      `;
      createState.selectedNest = null;
      createState.selectedEgg = null;
      createState.selectedDockerImage = null;
      createState.serverName = '';
      createState.step = 0;
      (async () => {
        try {
          const data = await api('/servers/nests');
          createState.nests = data.nests;
          renderWizardStep(0);
        } catch (err) {
          $('#create-wizard').innerHTML = html`
            <div class="card" style="max-width:600px;text-align:center;padding:48px">
              <p style="color:var(--accent-red);margin:0 0 16px">Failed to load data: ${escapeHtml(err.message)}</p>
              <button class="btn btn-primary" onclick="navigateTo('create')">Retry</button>
            </div>
          `;
        }
      })();
    }
    else if (basePage === 'pyrodactyl') renderPyrodactyl();
    else if (basePage === 'account') {
      if (param === 'edit') renderAccountEdit();
      else if (param === 'dangerous') renderDangerous();
      else renderAccount();
    } else if (basePage === 'logs') {
      renderLog();
    }
  }

  updateNavIndicator();

  if (window.innerWidth <= 768) {
    $('#sidebar').classList.remove('open');
  }

  initIcons();
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
  if (path.startsWith('/admin')) return; // Handled by admin.js
  const parts = path.replace(/^\//, '').split('/');
  let basePage = parts[0] || 'overview';
  const param = parts[1];
  const tab = parts[2];

  // Auth pages - redirect to / if already logged in
  if ((basePage === 'login' || basePage === 'signup') && state.token) {
    basePage = 'overview';
  }

  if (basePage === 'login') { renderLoginPage(); return; }
  if (basePage === 'signup') { renderRegisterPage(); return; }
  if (!state.token) { renderLoginPage(); return; }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  state.currentPage = basePage;
  state.serverId = param ? parseInt(param) : null;
  state.serverDetailTab = tab || 'info';

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
    else if (basePage === 'create') {
      const el = $('#page-create');
      el.innerHTML = html`
        <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <h1 class="page-title">Create Server</h1>
            <p class="page-subtitle">Deploy a new server in minutes</p>
          </div>
        </div>
        <div id="create-wizard"></div>
      `;
      createState.selectedNest = null;
      createState.selectedEgg = null;
      createState.selectedDockerImage = null;
      createState.serverName = '';
      createState.step = 0;
      (async () => {
        try {
          const data = await api('/servers/nests');
          createState.nests = data.nests;
          renderWizardStep(0);
        } catch (err) {
          $('#create-wizard').innerHTML = html`
            <div class="card" style="max-width:600px;text-align:center;padding:48px">
              <p style="color:var(--accent-red);margin:0 0 16px">Failed to load data: ${escapeHtml(err.message)}</p>
              <button class="btn btn-primary" onclick="navigateTo('create')">Retry</button>
            </div>
          `;
        }
      })();
    }
    else if (basePage === 'pyrodactyl') renderPyrodactyl();
    else if (basePage === 'account') {
      if (param === 'edit') renderAccountEdit();
      else if (param === 'dangerous') renderDangerous();
      else renderAccount();
    } else if (basePage === 'logs') {
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
      <div class="stat-card"><div class="stat-icon"><i data-lucide="server" style="width:20px;height:20px"></i></div><div class="stat-value" id="stat-total">—</div><div class="stat-label">Total Servers</div></div>
      <div class="stat-card"><div class="stat-icon"><i data-lucide="activity" style="width:20px;height:20px"></i></div><div class="stat-value" id="stat-active">—</div><div class="stat-label">Active Servers</div></div>
      <div class="stat-card"><div class="stat-icon"><i data-lucide="target" style="width:20px;height:20px"></i></div><div class="stat-value" id="stat-slots">—</div><div class="stat-label">Server Slots</div></div>
      <div class="stat-card"><div class="stat-icon"><i data-lucide="eye" style="width:20px;height:20px"></i></div><div class="stat-value" id="stat-renew">—</div><div class="stat-label">To Renew</div></div>
    </div>
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Your Servers</h2>
      </div>
      <div id="recent-servers-list">
        <div style="text-align:center;padding:32px;color:var(--text-secondary)"><span class="spinner"></span> Loading...</div>
      </div>
    </div>
  `;

  try {
    const data = await api('/servers/overview');

    if (data.restricted !== undefined) {
      state.user = { ...state.user, restricted: data.restricted };
      const banner = $('#restricted-banner');
      if (banner) banner.style.display = data.restricted ? 'block' : 'none';
    }

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
          <div class="empty-state-icon"><i data-lucide="server" style="width:24px;height:24px"></i></div>
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

  initIcons();
}

let activityIcons = {
  server_created: '<i data-lucide="plus-circle" style="width:14px;height:14px"></i>',
  server_renewed: '<i data-lucide="refresh-cw" style="width:14px;height:14px"></i>',
  server_renamed: '<i data-lucide="edit" style="width:14px;height:14px"></i>',
  server_reinstalled: '<i data-lucide="refresh-cw" style="width:14px;height:14px"></i>',
  server_deleted: '<i data-lucide="trash-2" style="width:14px;height:14px"></i>',
  account_registered: '<i data-lucide="user-plus" style="width:14px;height:14px"></i>',
  password_changed: '<i data-lucide="lock" style="width:14px;height:14px"></i>',
  email_changed: '<i data-lucide="mail" style="width:14px;height:14px"></i>',
  account_deleted: '<i data-lucide="triangle-alert" style="width:14px;height:14px"></i>',
  api_key_updated: '<i data-lucide="key" style="width:14px;height:14px"></i>',
  avatar_updated: '<i data-lucide="image" style="width:14px;height:14px"></i>',
  admin_suspend: '<i data-lucide="shield-off" style="width:14px;height:14px"></i>',
  admin_unsuspend: '<i data-lucide="shield-check" style="width:14px;height:14px"></i>',
  admin_renew_now: '<i data-lucide="refresh-cw" style="width:14px;height:14px"></i>',
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
    avatar_updated: 'Profile picture updated',
    admin_suspend: 'Server suspended (Admin)',
    admin_unsuspend: 'Server unsuspended (Admin)',
    admin_renew_now: 'Server force-renewed (Admin)',
  };
  return labels[action] || action;
}

async function renderLog(pageNum) {
  const el = $('#page-logs');
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
              <div class="activity-action">${escapeHtml(getActionLabel(a.action))}</div>
              <div class="activity-details">${escapeHtml(a.details || '')}</div>
            </div>
            <div class="activity-time">${formatRelativeTime(a.created_at)}</div>
          </div>
        `).join('')}
      </div>
      ${pageInfo}
    `;
    initIcons();
  } catch (err) {
    const list = $('#log-list');
    if (list) list.innerHTML = '<div class="activity-empty">Could not load activity log.</div>';
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
  const meta = s.serverMeta;
  const days = meta ? daysRemaining(meta.expires_at) : null;
  const canRenew = days !== null && days <= 7 && days >= -7;
  const isAdminSuspended = isSuspended && meta?.suspended_by === 'admin';
  const isExpiredRenewable = isSuspended && canRenew && !isAdminSuspended;
  const statusClass = isAdminSuspended ? 'status-suspended' : (isExpiredRenewable ? 'status-expired' : (isInstalling ? 'status-installing' : 'status-active'));
  const statusLabel = isAdminSuspended ? 'Suspended' : (isExpiredRenewable ? 'Expired' : (isInstalling ? 'Installing' : 'Active'));
  const allocStr = alloc ? `${alloc.alias || alloc.nodeFqdn || alloc.ip}:${alloc.port}` : (s.nodeFqdn || `Node #${s.node}`);
  const expClass = days !== null && days <= 0 ? 'expired' : (days !== null && days <= 7 ? 'expiring' : '');
  return html`
    <div class="server-card">
      <div class="server-card-top" style="cursor:pointer" onclick="navigateTo('server/${s.id}')">
        <span class="server-card-name">${escapeHtml(s.name)}</span>
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
          <i data-lucide="external-link" style="width:14px;height:14px"></i>
          Open Panel
        </button>
        ${canRenew && !isAdminSuspended ? html`
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
  const meta = s.serverMeta;
  const days = meta ? daysRemaining(meta.expires_at) : null;
  const canRenew = days !== null && days <= 7 && days >= -7;
  const isAdminSuspended = isSuspended && meta?.suspended_by === 'admin';
  const isExpiredRenewable = isSuspended && canRenew && !isAdminSuspended;
  const powerState = s.currentState ? s.currentState.charAt(0).toUpperCase() + s.currentState.slice(1) : null;
  const statusClass = isAdminSuspended ? 'status-suspended' : (isExpiredRenewable ? 'status-expired' : (isInstalling ? 'status-installing' : (powerState === 'Offline' ? 'status-offline' : 'status-active')));
  const statusLabel = isAdminSuspended ? 'Suspended' : (isExpiredRenewable ? 'Expired' : (isInstalling ? 'Installing' : (powerState || 'Active')));
  const allocStr = alloc ? `${alloc.alias || alloc.nodeFqdn || alloc.ip}:${alloc.port}` : (s.nodeFqdn || `Node #${s.node}`);
  return html`
    <tr>
      <td><strong><a href="/server/${s.id}" onclick="event.preventDefault();navigateTo('server/${s.id}')" style="color:inherit;text-decoration:none">${escapeHtml(s.name)}</a></strong></td>
      <td><span class="server-detail-tag">${eggName}</span></td>
      <td><span class="server-detail-tag">${allocStr}</span></td>
      <td>
        <span class="server-card-status ${statusClass}">${statusLabel}</span>
      </td>
      <td>
        <div style="display:flex;gap:6px">
          <a class="btn btn-ghost btn-sm" href="/server/${s.id}" onclick="event.preventDefault();navigateTo('server/${s.id}')">Settings</a>
          <button class="btn btn-ghost btn-sm" onclick="openPyrodactylPanel('${s.identifier}')">Manage Pyrodactyl</button>
          ${canRenew && !isAdminSuspended ? html`
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
        <i data-lucide="search" style="width:16px;height:16px"></i>
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
      const container = el.querySelector('.table-container');
      container.innerHTML = html`
        <div class="empty-state">
          <div class="empty-state-icon"><i data-lucide="server" style="width:24px;height:24px"></i></div>
          <div class="empty-state-title">No servers yet</div>
          <div class="empty-state-desc">Create your first server to get started</div>
          <button class="btn btn-primary" id="servers-empty-create-btn">Create Server</button>
        </div>
      `;
      $('#servers-empty-create-btn').addEventListener('click', () => navigateTo('create'));
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

  initIcons();
}

// ===== CREATE SERVER (Wizard) =====
const createState = {
  nests: [],
  selectedNest: null,
  selectedEgg: null,
  selectedDockerImage: null,
  serverName: '',
  step: 0,
};

function renderWizardStep(step, direction) {
  const prevStep = createState.step;
  createState.step = step;
  const container = $('#create-wizard');
  const headerEl = document.querySelector('#page-create .page-header');
  const steps = [
    { label: 'Nest', icon: 'layout-grid' },
    { label: 'Egg', icon: 'egg' },
    { label: 'Name', icon: 'type' },
    { label: 'Summary', icon: 'file-text' },
  ];

  const totalSteps = steps.length;
  const stepsHtml = steps.map((s, i) => html`
    <div class="wizard-step-indicator ${i < step ? 'completed' : i === step ? 'active' : ''}" data-index="${i}">
      <div class="wizard-step-circle"><i data-lucide="${s.icon}" style="width:14px;height:14px"></i></div>
      <span class="wizard-step-label">${s.label}</span>
    </div>
  `).join('');

  let contentHtml = '';
  if (step === 0) contentHtml = renderNestStep();
  else if (step === 1) contentHtml = renderEggStep();
  else if (step === 2) contentHtml = renderNameStep();
  else if (step === 3) contentHtml = renderSummaryStep();

  const slideClass = direction === 'next' ? 'slide-left' : direction === 'back' ? 'slide-right' : '';

  const progressHtml = html`
    <div class="wizard-progress">
      <div class="wizard-progress-track" style="transform:translateX(${step * 25}%)"></div>
      ${stepsHtml}
    </div>
  `;

  if (headerEl) {
    const existing = headerEl.querySelector('.wizard-progress');
    if (existing) existing.remove();
    headerEl.insertAdjacentHTML('beforeend', progressHtml);
  }

  container.innerHTML = html`
    <div class="wizard-content-wrapper">
      <div class="wizard-content ${slideClass}">${contentHtml}</div>
    </div>
  `;

  initIcons();
  attachWizardListeners(step);
}

function renderNestStep() {
  if (createState.nests.length === 0) {
    return html`<div class="card" style="text-align:center;padding:48px"><p style="color:var(--text-secondary)">No nests available.</p></div>`;
  }
  return html`
    <div class="wizard-step-title">Choose a Nest</div>
    <p class="wizard-step-desc">Select the type of server you want to create</p>
    <div class="nest-grid">
      ${createState.nests.map(n => html`
        <div class="nest-card ${createState.selectedNest?.pteroNestId === n.pteroNestId ? 'selected' : ''}" data-nest-id="${n.pteroNestId}">
          <div class="nest-card-logo">
            ${n.logo ? html`<img src="${n.logo}" alt="" />` : html`<i data-lucide="box" style="width:40px;height:40px;color:var(--text-secondary)"></i>`}
          </div>
          <div class="nest-card-name">${escapeHtml(n.name)}</div>
          ${n.description ? html`<div class="nest-card-desc">${escapeHtml(n.description)}</div>` : ''}
        </div>
      `).join('')}
    </div>
    <div class="wizard-actions">
      <button class="btn btn-primary" id="wizard-next-btn" ${createState.selectedNest ? '' : 'disabled'}>
        Next <i data-lucide="arrow-right" style="width:16px;height:16px"></i>
      </button>
    </div>
  `;
}

function renderEggStep() {
  const nest = createState.selectedNest;
  if (!nest || !nest.eggs || nest.eggs.length === 0) {
    return html`<div class="card" style="text-align:center;padding:48px"><p style="color:var(--text-secondary)">No eggs available in this nest.</p></div>`;
  }

  const eggCards = nest.eggs.map(e => {
    const dockerImages = e.dockerImages || {};
    const images = Object.entries(dockerImages);
    return html`
      <div class="egg-card ${createState.selectedEgg?.eggId === e.eggId ? 'selected' : ''}" data-egg-id="${e.eggId}">
        <div class="egg-card-logo">
          ${e.logo ? html`<img src="${e.logo}" alt="" />` : html`<i data-lucide="egg" style="width:32px;height:32px;color:var(--text-secondary)"></i>`}
        </div>
        <div class="egg-card-info">
          <div class="egg-card-name">${escapeHtml(e.name)}</div>
          ${e.description ? html`<div class="egg-card-desc">${escapeHtml(e.description)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  let dockerSection = '';
  const selEgg = createState.selectedEgg;
  if (selEgg) {
    const images = Object.entries(selEgg.dockerImages || {});
    if (images.length > 1) {
      const optionsHtml = images.map(([displayName, image]) => {
        const shortName = displayName || image.split('/').pop().split(':').pop() || image;
        return `<div class="custom-select-option" data-value="${escapeHtml(image)}">${escapeHtml(shortName)}</div>`;
      }).join('');
      const currentLabel = createState.selectedDockerImage
        ? (images.find(([, img]) => img === createState.selectedDockerImage)?.[0] || createState.selectedDockerImage.split('/').pop().split(':').pop())
        : 'Select an image';
      dockerSection = html`
        <div class="wizard-subsection" style="margin-top:24px">
          <div class="wizard-step-title" style="font-size:1rem">Docker Image</div>
          <p class="wizard-step-desc">Choose a Docker image for this egg</p>
          <div class="custom-select" id="docker-select">
            <div class="custom-select-trigger" tabindex="0">
              <span class="custom-select-label">${escapeHtml(currentLabel)}</span>
              <i data-lucide="chevron-down" class="custom-select-arrow" style="width:16px;height:16px"></i>
            </div>
            <div class="custom-select-dropdown">${optionsHtml}</div>
          </div>
        </div>
      `;
    }
  }

  return html`
    <div class="wizard-step-title">Choose an Egg</div>
    <p class="wizard-step-desc">Select the software or game you want to run</p>
    <div class="egg-grid">${eggCards}</div>
    ${dockerSection}
    <div class="wizard-actions">
      <button class="btn btn-ghost" id="wizard-back-btn"><i data-lucide="arrow-left" style="width:16px;height:16px"></i> Back</button>
      <button class="btn btn-primary" id="wizard-next-btn" ${createState.selectedEgg ? '' : 'disabled'}>
        Next <i data-lucide="arrow-right" style="width:16px;height:16px"></i>
      </button>
    </div>
  `;
}

function renderNameStep() {
  return html`
    <div class="wizard-step-title">Name Your Server</div>
    <p class="wizard-step-desc">Give your server a memorable name</p>
    <div class="card" style="max-width:480px">
      <div class="form-group">
        <label for="create-name-input">Server Name</label>
        <input type="text" id="create-name-input" placeholder="My Awesome Server" value="${escapeHtml(createState.serverName)}" maxlength="255" style="width:100%" />
      </div>
      <div style="margin-top:8px;color:var(--text-secondary);font-size:0.82rem">
        Allowed: letters, numbers, spaces, dots, dashes, underscores
      </div>
    </div>
    <div class="wizard-actions">
      <button class="btn btn-ghost" id="wizard-back-btn"><i data-lucide="arrow-left" style="width:16px;height:16px"></i> Back</button>
      <button class="btn btn-primary" id="wizard-next-btn" disabled>
        Next <i data-lucide="arrow-right" style="width:16px;height:16px"></i>
      </button>
    </div>
  `;
}

function renderSummaryStep() {
  const nest = createState.selectedNest;
  const egg = createState.selectedEgg;
  let dockerLabel = 'Default';
  if (egg && createState.selectedDockerImage) {
    const images = Object.entries(egg.dockerImages || {});
    const found = images.find(([, img]) => img === createState.selectedDockerImage);
    if (found) {
      dockerLabel = found[0] || createState.selectedDockerImage.split('/').pop().split(':').pop() || createState.selectedDockerImage;
    } else {
      const raw = createState.selectedDockerImage;
      dockerLabel = raw.split('/').pop().split(':').pop() || raw || 'Default';
    }
  }

  return html`
    <div class="wizard-step-title">Summary</div>
    <p class="wizard-step-desc">Review your choices before creating the server</p>
    <div class="summary-card">
      <div class="summary-row">
        <span class="summary-label">Nest</span>
        <span class="summary-value">${escapeHtml(nest?.name || '—')}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Egg</span>
        <span class="summary-value">${escapeHtml(egg?.name || '—')}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Docker Image</span>
        <span class="summary-value">${escapeHtml(dockerLabel)}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Server Name</span>
        <span class="summary-value">${escapeHtml(createState.serverName)}</span>
      </div>
    </div>
    <div class="card" style="margin-top:20px;max-width:480px">
      <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px">Default Resources</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <span class="server-detail-tag">512 MB RAM</span>
        <span class="server-detail-tag">50% CPU</span>
        <span class="server-detail-tag">3 GB Disk</span>
      </div>
    </div>
    <div style="margin:20px 0;width:100%">
      <cap-widget data-cap-api-endpoint="https://cap.zero-host.org/f6c8171b08/" theme="dark"></cap-widget>
    </div>
    <div class="wizard-actions">
      <button class="btn btn-ghost" id="wizard-back-btn"><i data-lucide="arrow-left" style="width:16px;height:16px"></i> Back</button>
      <button class="btn btn-primary" id="wizard-create-btn">
        <i data-lucide="plus" style="width:16px;height:16px"></i> Create Server
      </button>
    </div>
  `;
}

function attachWizardListeners(step) {
  const backBtn = $('#wizard-back-btn');
  const nextBtn = $('#wizard-next-btn');
  const createBtn = $('#wizard-create-btn');

  if (backBtn) {
    backBtn.addEventListener('click', () => renderWizardStep(step - 1));
  }

  if (step === 0) {
    const cards = document.querySelectorAll('.nest-card');
    cards.forEach(c => {
      c.addEventListener('click', () => {
        cards.forEach(c2 => c2.classList.remove('selected'));
        c.classList.add('selected');
        const nestId = parseInt(c.dataset.nestId, 10);
        createState.selectedNest = createState.nests.find(n => n.pteroNestId === nestId) || null;
        createState.selectedEgg = null;
        createState.selectedDockerImage = null;
        const next = $('#wizard-next-btn');
        if (next) next.disabled = false;
      });
    });
    if (nextBtn) {
      nextBtn.addEventListener('click', () => renderWizardStep(1));
    }
  }

  if (step === 1) {
    const eggCards = document.querySelectorAll('.egg-card');
    eggCards.forEach(c => {
      c.addEventListener('click', () => {
        eggCards.forEach(c2 => c2.classList.remove('selected'));
        c.classList.add('selected');
        const eggId = parseInt(c.dataset.eggId, 10);
        const nest = createState.selectedNest;
        createState.selectedEgg = nest?.eggs.find(e => e.eggId === eggId) || null;
        createState.selectedDockerImage = null;
        renderWizardStep(1);
      });
    });

    const dockerSelect = document.querySelector('#docker-select');
    if (dockerSelect) {
      const trigger = dockerSelect.querySelector('.custom-select-trigger');
      const label = dockerSelect.querySelector('.custom-select-label');

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
        dockerSelect.classList.add('open');
      });

      dockerSelect.querySelectorAll('.custom-select-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          createState.selectedDockerImage = opt.dataset.value;
          label.textContent = opt.textContent;
          dockerSelect.classList.remove('open');
        });
      });

      document.addEventListener('click', () => {
        dockerSelect.classList.remove('open');
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (!createState.selectedEgg) return;
        const images = Object.entries(createState.selectedEgg.dockerImages || {});
        if (images.length === 1) {
          createState.selectedDockerImage = images[0][1];
        } else if (images.length > 1 && !createState.selectedDockerImage) {
          showToast('Please select a Docker image', 'error');
          return;
        } else if (images.length > 1 && createState.selectedDockerImage) {
          // already selected
        }
        renderWizardStep(2);
      });
    }
  }

  if (step === 2) {
    const input = $('#create-name-input');
    if (input) {
      input.focus();
      input.addEventListener('input', () => {
        const val = input.value.trim();
        createState.serverName = val;
        const next = $('#wizard-next-btn');
        if (next) {
          next.disabled = !isValidServerName(val);
        }
      });
      // Trigger initial validation
      if (createState.serverName) {
        input.value = createState.serverName;
        const next = $('#wizard-next-btn');
        if (next) next.disabled = !isValidServerName(createState.serverName);
      }
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const name = createState.serverName;
        if (!name) { showToast('Please enter a server name', 'error'); return; }
        if (!isValidServerName(name)) { showToast('Server name contains invalid characters', 'error'); return; }
        renderWizardStep(3);
      });
    }
  }

  if (step === 3 && createBtn) {
    createBtn.addEventListener('click', handleWizardCreate);
  }
}

function isValidServerName(name) {
  return name && name.length >= 1 && name.length <= 255 && /^[a-zA-Z0-9 _.-]+$/.test(name);
}

async function handleWizardCreate() {
  const btn = $('#wizard-create-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating...';

  const name = createState.serverName;
  const nest = createState.selectedNest;
  const egg = createState.selectedEgg;
  if (!name || !nest || !egg) {
    showToast('Missing required selections', 'error');
    btn.disabled = false;
    btn.innerHTML = 'Create Server';
    return;
  }

  const environment = {};
  const dockerImage = createState.selectedDockerImage || '';

  try {
    const capToken = document.querySelector('[name="cap-token"]')?.value || '';
    await api('/servers/create', {
      method: 'POST',
      body: JSON.stringify({ name, nestId: nest.pteroNestId, eggId: egg.eggId, environment, capToken, dockerImage }),
    });
    showToast(`Server "${name}" created successfully!`, 'success');
    navigateTo('servers');
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="plus" style="width:16px;height:16px"></i> Create Server';
    initIcons();
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
          <i data-lucide="package" style="width:28px;height:28px"></i>
        </div>
        <h2 class="ptero-card-title">Opening Pyrodactyl...</h2>
        <p class="ptero-card-desc">
          Click the button below to open the Pyrodactyl panel.
        </p>
        <button class="btn btn-primary btn-full" id="ptero-open-btn" onclick="openPyrodactylPanel()">
          <i data-lucide="external-link" style="width:18px;height:18px"></i>
          Open Panel Now
        </button>
      </div>
    </div>
  `;
  setTimeout(() => openPyrodactylPanel(), 500);
  initIcons();
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
            <i data-lucide="edit" style="width:22px;height:22px"></i>
          </div>
          <div class="account-menu-text">
            <div class="account-menu-title">Change Account Info</div>
            <div class="account-menu-desc">Update your email address or password</div>
          </div>
          <i data-lucide="chevron-right" style="width:18px;height:18px;color:var(--text-muted);flex-shrink:0"></i>
        </div>
      </div>

      <div class="card account-menu-card" id="account-menu-logs" style="cursor:pointer">
        <div class="account-menu-item">
          <div class="account-menu-icon">
            <i data-lucide="file-text" style="width:22px;height:22px"></i>
          </div>
          <div class="account-menu-text">
            <div class="account-menu-title">Activity Log</div>
            <div class="account-menu-desc">View all account activity</div>
          </div>
          <i data-lucide="chevron-right" style="width:18px;height:18px;color:var(--text-muted);flex-shrink:0"></i>
        </div>
      </div>

      <div class="card account-menu-card" id="account-menu-logout" style="cursor:pointer">
        <div class="account-menu-item">
          <div class="account-menu-icon" style="color:var(--accent-red)">
            <i data-lucide="log-out" style="width:22px;height:22px"></i>
          </div>
          <div class="account-menu-text">
            <div class="account-menu-title">Sign Out</div>
            <div class="account-menu-desc">Logout from your account</div>
          </div>
          <i data-lucide="chevron-right" style="width:18px;height:18px;color:var(--text-muted);flex-shrink:0"></i>
        </div>
      </div>

      <div class="card account-menu-card" id="account-menu-dangerous" style="cursor:pointer">
        <div class="account-menu-item">
          <div class="account-menu-icon" style="color:var(--accent-red)">
            <i data-lucide="triangle-alert" style="width:22px;height:22px"></i>
          </div>
          <div class="account-menu-text">
            <div class="account-menu-title">Dangerous Zone & Export Account Data</div>
            <div class="account-menu-desc">Delete your account or export your personal data (RGPD)</div>
          </div>
          <i data-lucide="chevron-right" style="width:18px;height:18px;color:var(--text-muted);flex-shrink:0"></i>
        </div>
      </div>
    </div>
  `;

  $('#account-menu-edit').addEventListener('click', () => navigateTo('account/edit'));
  $('#account-menu-logs').addEventListener('click', () => navigateTo('logs'));
  $('#account-menu-dangerous').addEventListener('click', () => navigateTo('account/dangerous'));
  $('#account-menu-logout').addEventListener('click', async () => {
    initIcons();
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    state.token = null;
    state.user = null;
    localStorage.removeItem('zh_token');
    localStorage.removeItem('zh_user');
    navigateTo('login');
  });
}

function renderAccountEdit() {
  const el = $('#page-account');
  el.innerHTML = html`
    <div class="page-header" style="display:flex;align-items:center;gap:12px">
      <a href="/account" onclick="event.preventDefault();navigateTo('account')" style="color:var(--text-muted);display:flex;padding:4px;border-radius:var(--radius-sm);cursor:pointer">
        <i data-lucide="arrow-left" style="width:20px;height:20px"></i>
      </a>
      <div>
        <h1 class="page-title" style="margin:0">Change Account Info</h1>
        <p class="page-subtitle" style="margin:0">Update your email address or password</p>
      </div>
    </div>
    <div class="account-grid">
      <div class="card">
        <h2 class="card-title" style="margin-bottom:20px">Profile Picture</h2>
        <div class="avatar-upload">
          <div class="avatar-upload-preview">
            <img id="avatar-preview-img" src="${avatarUrl(state.user?.id)}" alt="" onerror="this.style.display='none';document.getElementById('avatar-preview-placeholder').style.display='flex'" onload="document.getElementById('avatar-preview-placeholder').style.display='none'" />
            <div class="avatar-upload-placeholder" id="avatar-preview-placeholder">${state.user?.username?.[0]?.toUpperCase() || 'U'}</div>
          </div>
          <div class="avatar-upload-info">
            <p style="color:var(--text-secondary);font-size:0.85rem;line-height:1.6;margin-bottom:12px">
              Upload a profile picture. Supported formats: PNG, JPEG, GIF, WebP. Max size: 2MB.
            </p>
            <input type="file" id="avatar-file-input" accept="image/png,image/jpeg,image/gif,image/webp" hidden />
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" id="avatar-choose-btn">Choose Image</button>
              <button class="btn btn-primary" id="avatar-upload-btn" disabled style="display:none">Upload</button>
            </div>
            <div id="avatar-status" style="margin-top:8px;font-size:0.82rem;color:var(--text-muted)"></div>
          </div>
        </div>
      </div>

      <div class="card">
        <h2 class="card-title" style="margin-bottom:20px">Change Email</h2>
        <form id="change-email-form" style="width:100%">
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
        <form id="change-password-form" style="width:100%">
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
        <div id="api-key-section-content">
          <form id="api-key-form" style="width:100%">
            <div class="form-group">
              <label for="ptero-api-key-input">API Key</label>
              <input type="password" id="ptero-api-key-input" placeholder="ptla_..." autocomplete="off" />
            </div>
            <button type="submit" class="btn btn-primary btn-full" id="save-api-key-btn">Save</button>
          </form>
          <div id="api-key-status" style="margin-top:8px;font-size:0.82rem;color:var(--text-muted)"></div>
        </div>
      </div>
    </div>
  `;

  $('#change-email-form').addEventListener('submit', handleChangeEmail);
  $('#change-password-form').addEventListener('submit', handleChangePassword);
  $('#api-key-form').addEventListener('submit', handleSaveApiKey);

  $('#avatar-choose-btn').addEventListener('click', () => {
    $('#avatar-file-input').click();
  });

  $('#avatar-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      $('#avatar-status').textContent = 'Invalid file type. Please use PNG, JPEG, GIF, or WebP.';
      $('#avatar-status').style.color = 'var(--accent-red)';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      $('#avatar-status').textContent = 'File too large. Maximum size is 2MB.';
      $('#avatar-status').style.color = 'var(--accent-red)';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      $('#avatar-preview-img').src = ev.target.result;
      $('#avatar-preview-img').style.display = 'block';
      $('#avatar-preview-placeholder').style.display = 'none';
      $('#avatar-upload-btn').style.display = 'inline-flex';
      $('#avatar-upload-btn').disabled = false;
      $('#avatar-status').textContent = 'Click "Upload" to save your new profile picture.';
      $('#avatar-status').style.color = 'var(--text-muted)';
    };
    reader.readAsDataURL(file);
  });

  $('#avatar-upload-btn').addEventListener('click', handleAvatarUpload);

  checkApiKeyStatus();
  initIcons();
}

async function handleAvatarUpload() {
  const btn = $('#avatar-upload-btn');
  const status = $('#avatar-status');
  const img = $('#avatar-preview-img');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  status.textContent = '';

  try {
    const data = await api('/auth/upload-avatar', {
      method: 'POST',
      body: JSON.stringify({ image: img.src }),
    });
    showToast('Profile picture updated successfully', 'success');
    status.textContent = 'Profile picture updated!';
    status.style.color = 'var(--accent-green)';
    btn.style.display = 'none';

    const sidebarImg = document.querySelector('#avatar-container img');
    if (sidebarImg) {
      sidebarImg.src = avatarUrl(state.user.id);
      sidebarImg.dataset.fallbackTried = '';
      sidebarImg.style.display = '';
      const fallback = document.getElementById('avatar-fallback');
      if (fallback) fallback.style.display = 'none';
    }
  } catch (err) {
    status.textContent = err.message;
    status.style.color = 'var(--accent-red)';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Upload';
  }
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
    showToast('Pyrodactyl API key saved', 'success');
    renderApiKeySaved();
    return;
  } catch (err) {
    status.textContent = err.message;
    status.style.color = 'var(--accent-red)';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Save';
  }
}

async function checkApiKeyStatus() {
  try {
    const data = await api('/servers/client-api-key');
    if (data.hasKey) {
      renderApiKeySaved();
    }
  } catch (err) {
    // Keep default form if check fails
  }
}

function renderApiKeySaved() {
  const section = $('#api-key-section-content');
  section.innerHTML = html`
    <div style="padding:8px 0">
      <p style="color:var(--accent-green);font-size:0.9rem;margin-bottom:16px">
        <i data-lucide="check" style="width:16px;height:16px;color:var(--accent-green);stroke-width:3;margin-right:4px;vertical-align:middle"></i>Your Pyrodactyl API key is saved and active.
      </p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" id="modify-api-key-btn">Modify</button>
        <button class="btn btn-danger" id="delete-api-key-btn">Delete</button>
      </div>
    </div>
  `;
  $('#modify-api-key-btn').addEventListener('click', handleModifyApiKey);
  $('#delete-api-key-btn').addEventListener('click', handleDeleteApiKey);
}

function renderApiKeyForm() {
  const section = $('#api-key-section-content');
  section.innerHTML = html`
    <form id="api-key-form" style="width:100%">
      <div class="form-group">
        <label for="ptero-api-key-input">API Key</label>
        <input type="password" id="ptero-api-key-input" placeholder="ptla_..." autocomplete="off" />
      </div>
      <button type="submit" class="btn btn-primary btn-full" id="save-api-key-btn">Save</button>
    </form>
    <div id="api-key-status" style="margin-top:8px;font-size:0.82rem;color:var(--text-muted)"></div>
  `;
  $('#api-key-form').addEventListener('submit', handleSaveApiKey);
}

function handleModifyApiKey() {
  const overlay = $('#modal-overlay');
  const content = $('#modal-content');
  content.innerHTML = html`
    <div class="modal-title">Modify API Key</div>
    <p style="color:var(--text-secondary);line-height:1.6;margin-bottom:16px">
      Enter your new Pyrodactyl API key. The old key will be replaced.
    </p>
    <div class="form-group">
      <label for="modal-api-key-input">New API Key</label>
      <input type="password" id="modal-api-key-input" placeholder="ptla_..." autocomplete="off" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost btn-full modal-cancel-btn">Cancel</button>
      <button class="btn btn-primary btn-full" id="confirm-modify-api-key-btn">Save</button>
    </div>
  `;
  overlay.classList.add('open');
  $('#confirm-modify-api-key-btn').addEventListener('click', handleConfirmModifyApiKey);
}

function handleDeleteApiKey() {
  const overlay = $('#modal-overlay');
  const content = $('#modal-content');
  content.innerHTML = html`
    <div class="modal-title">Delete API Key</div>
    <p style="color:var(--text-secondary);line-height:1.6;margin-bottom:16px">
      Are you sure you want to delete your Pyrodactyl API key? Live resource monitoring and power state detection will stop working.
    </p>
    <div class="modal-actions">
      <button class="btn btn-ghost btn-full modal-cancel-btn">Cancel</button>
      <button class="btn btn-danger btn-full" id="confirm-delete-api-key-btn">Delete</button>
    </div>
  `;
  overlay.classList.add('open');
  $('#confirm-delete-api-key-btn').addEventListener('click', handleConfirmDeleteApiKey);
}

async function handleConfirmModifyApiKey() {
  const btn = $('#confirm-modify-api-key-btn');
  const input = $('#modal-api-key-input');
  const key = input.value.trim();

  if (!key) {
    showToast('Please enter an API key', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    await api('/servers/client-api-key', {
      method: 'PUT',
      body: JSON.stringify({ apiKey: key }),
    });
    $('#modal-overlay').classList.remove('open');
    showToast('Pyrodactyl API key updated', 'success');
    renderApiKeySaved();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Save';
  }
}

async function handleConfirmDeleteApiKey() {
  const btn = $('#confirm-delete-api-key-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    await api('/servers/client-api-key', {
      method: 'DELETE',
    });
    $('#modal-overlay').classList.remove('open');
    showToast('Pyrodactyl API key deleted', 'success');
    renderApiKeyForm();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Delete';
  }
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
        <i data-lucide="arrow-left" style="width:20px;height:20px"></i>
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
          <i data-lucide="download" style="width:18px;height:18px"></i>
          Export My Data
        </button>
      </div>
    </div>
  `;
  $('#delete-account-btn').addEventListener('click', handleDeleteAccountClick);
  $('#export-data-btn').addEventListener('click', handleExportData);
  initIcons();
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
    setTimeout(() => navigateTo('login'), 1500);
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
    state.serverIdentifier = s.identifier;
    const meta = s.serverMeta;
    const eggName = s.eggDetails?.name || `Egg #${s.egg}`;
    const alloc = s.allocationDetails;
  const allocStr = alloc ? `${alloc.alias || alloc.nodeFqdn || alloc.ip}:${alloc.port}` : (s.nodeFqdn || `Node #${s.node}`);
    const isInstalling = s.status === 'installing' || s.installed === 0 || s.installed === '0' || s.installed === false;
    const isSuspended = s.status === 'suspended';
    const days = meta ? daysRemaining(meta.expires_at) : null;
    const canRenew = days !== null && days <= 7 && days >= -7;
    const isAdminSuspended = isSuspended && meta?.suspended_by === 'admin';
    const isExpiredRenewable = isSuspended && canRenew && !isAdminSuspended;
    const statusClass = isAdminSuspended ? 'status-suspended' : (isExpiredRenewable ? 'status-expired' : (isInstalling ? 'status-installing' : 'status-active'));
    const statusLabel = isAdminSuspended ? 'Suspended' : (isExpiredRenewable ? 'Expired' : (isInstalling ? 'Installing' : 'Active'));
    const expClass = days !== null && days <= 0 ? 'expired' : (days !== null && days <= 7 ? 'expiring' : '');

    const activeTab = state.serverDetailTab || 'info';

    el.innerHTML = html`
      <div class="page-header">
        <a href="/servers" onclick="event.preventDefault();navigateTo('servers')" class="btn btn-ghost btn-sm" style="margin-bottom:16px;display:inline-flex;width:auto">
          <i data-lucide="arrow-left" style="width:14px;height:14px"></i>
          Back to Servers
        </a>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <h1 class="page-title" style="margin-bottom:0">${s.name}</h1>
          <button class="btn btn-ghost btn-sm btn-rename-server" data-server-id="${s.id}" data-server-name="${s.name.replace(/"/g, '&quot;')}" title="Rename server" style="width:auto;padding:6px">
            <i data-lucide="edit" style="width:16px;height:16px"></i>
          </button>
          <span class="server-card-status ${statusClass}" style="font-size:0.8rem">${statusLabel}</span>
        </div>
      </div>

      ${isAdminSuspended && meta?.suspend_reason ? html`
        <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:16px;margin-bottom:24px">
          <div style="font-weight:700;color:var(--accent-red);margin-bottom:4px">Server Suspended</div>
          <div style="color:var(--text-secondary);font-size:0.88rem">${meta.suspend_reason}</div>
        </div>
      ` : ''}
      ${isExpiredRenewable ? html`
        <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:16px;margin-bottom:24px">
          <div style="font-weight:700;color:var(--accent-orange);margin-bottom:4px">Server Expired</div>
          <div style="color:var(--text-secondary);font-size:0.88rem">This server has expired. Renew it to reactivate it instantly.</div>
        </div>
      ` : ''}

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
                <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value" style="text-transform:capitalize">${isExpiredRenewable ? 'expired' : meta.status}</span></div>
                ${isAdminSuspended && meta.suspend_reason ? html`
                  <div class="detail-item"><span class="detail-label">Reason</span><span class="detail-value" style="color:var(--accent-red)">${meta.suspend_reason}</span></div>
                ` : ''}
              </div>
              ${canRenew && !isAdminSuspended ? html`
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
              <i data-lucide="refresh-cw" style="width:14px;height:14px"></i>
              Refresh
            </button>
          </div>
          <div id="live-resources-container">
            <div style="text-align:center;padding:32px;color:var(--text-secondary)" id="live-resources-loading"><span class="spinner"></span> Fetching live data...</div>
          </div>
        </div>
      </div>

      <div id="server-tab-actions" class="tab-content" style="display:${activeTab === 'actions' ? 'block' : 'none'}">
        ${isAdminSuspended ? html`
        <div style="text-align:center;padding:48px 24px">
          <i data-lucide="lock" style="width:64px;height:64px;color:var(--accent-red);stroke-width:1.5;margin-bottom:16px"></i>
          <h2 style="margin:0 0 8px 0;color:var(--text-primary)">Server Suspended</h2>
          <p style="color:var(--text-secondary);font-size:0.95rem;margin:0 0 4px 0">This server has been suspended by an administrator. No actions are available.</p>
          <p style="color:var(--text-secondary);font-size:0.95rem;margin:0">Please contact support via <a href="https://discord.zero-host.org" target="_blank" style="color:var(--accent-1);text-decoration:underline">Discord</a> for assistance.</p>
        </div>
        ` : isExpiredRenewable ? html`
        <div style="text-align:center;padding:48px 24px">
          <i data-lucide="clock" style="width:64px;height:64px;color:var(--accent-orange);stroke-width:1.5;margin-bottom:16px"></i>
          <h2 style="margin:0 0 8px 0;color:var(--text-primary)">Server Expired</h2>
          <p style="color:var(--text-secondary);font-size:0.95rem;margin:0 0 4px 0">This server has expired. Renew it to reactivate it instantly and get 90 more days.</p>
          <button class="btn btn-primary btn-renew-server" data-server-id="${s.id}" style="margin-top:16px">Renew Server (90 days)</button>
        </div>
        ` : isSuspended ? html`
        <div style="text-align:center;padding:48px 24px">
          <i data-lucide="lock" style="width:64px;height:64px;color:var(--accent-red);stroke-width:1.5;margin-bottom:16px"></i>
          <h2 style="margin:0 0 8px 0;color:var(--text-primary)">Server Expired</h2>
          <p style="color:var(--text-secondary);font-size:0.95rem;margin:0 0 4px 0">This server has been expired for too long. Please contact support to renew.</p>
          <p style="color:var(--text-secondary);font-size:0.95rem;margin:0">Reach out via <a href="https://discord.zero-host.org" target="_blank" style="color:var(--accent-1);text-decoration:underline">Discord</a> for assistance.</p>
        </div>
        ` : html`
        <div class="server-detail-grid">
          <div class="action-card">
            <div class="action-card-header">
              <i data-lucide="zap" style="width:24px;height:24px"></i>
              <div>
                <h3 class="action-card-title">Power Controls</h3>
                <p class="action-card-desc">
                  Current state: <strong>${s.currentState || 'Unknown'}</strong>
                </p>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn ${s.currentState === 'running' ? 'btn-ghost' : 'btn-success'} btn-full" style="flex:1" onclick="sendPowerCommand('${s.identifier}','start',event)" ${s.currentState === 'running' ? 'disabled' : ''}>Start</button>
              <button class="btn btn-warning btn-full" style="flex:1" onclick="sendPowerCommand('${s.identifier}','stop',event)" ${s.currentState !== 'running' ? 'disabled' : ''}>Stop</button>
              <button class="btn btn-ghost btn-full" style="flex:1" onclick="sendPowerCommand('${s.identifier}','restart',event)" ${s.currentState !== 'running' ? 'disabled' : ''}>Restart</button>
            </div>
          </div>

          <div class="action-card">
            <div class="action-card-header">
              <i data-lucide="external-link" style="width:24px;height:24px"></i>
              <div>
                <h3 class="action-card-title">Open Panel</h3>
                <p class="action-card-desc">Access the full Pyrodactyl control panel to manage files, console, databases, schedules, and more.</p>
              </div>
            </div>
            <button class="btn btn-primary btn-full" onclick="openPyrodactylPanel('${s.identifier}')">Open Panel</button>
          </div>

          <div class="action-card">
            <div class="action-card-header">
              <i data-lucide="refresh-cw" style="width:24px;height:24px"></i>
              <div>
                <h3 class="action-card-title">Reinstall Server</h3>
                <p class="action-card-desc">Delete all files and reinstall the server from scratch. Only do this if you are experiencing critical issues with your server.</p>
              </div>
            </div>
            <button class="btn btn-warning btn-full btn-reinstall-server" data-server-id="${s.id}" data-server-name="${s.name.replace(/"/g, '&quot;')}">Reinstall Server</button>
          </div>

          <div class="action-card">
            <div class="action-card-header">
              <i data-lucide="trash-2" style="width:24px;height:24px"></i>
              <div>
                <h3 class="action-card-title">Delete Server</h3>
                <p class="action-card-desc">Permanently delete this server and all associated data. This action is irreversible.</p>
              </div>
            </div>
            <button class="btn btn-danger btn-full btn-delete-server" data-server-id="${s.id}" data-server-name="${s.name.replace(/"/g, '&quot;')}">Delete Server</button>
          </div>
        </div>
        `}
      </div>
    `;

    if (activeTab === 'resources') {
      fetchLiveResources(s.identifier);
    }

    // Disable transition for initial position to prevent sliding from 0
    const indicator = $('#tab-indicator');
    const activeTabEl = $('#server-detail-tabs .tab.active');
    if (indicator && activeTabEl) {
      const pos = activeTabEl.offsetLeft;
      const w = activeTabEl.offsetWidth;
      indicator.style.transition = 'none';
      indicator.style.left = pos + 'px';
      indicator.style.width = w + 'px';
      void indicator.offsetWidth;
      indicator.style.transition = '';
    }

    initIcons();

  } catch (err) {
    el.innerHTML = html`
      <div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="circle-alert" style="width:24px;height:24px"></i></div>
        <div class="empty-state-title">Server not found</div>
        <div class="empty-state-desc">${err.message}</div>
        <button class="btn btn-primary" onclick="navigateTo('servers')">Back to Servers</button>
      </div>
    `;
    initIcons();
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

// ===== TAB SWITCHING =====
function switchTab(tabBtn) {
  if (!$('#tab-indicator')) return;
  const tabName = tabBtn.dataset.tab;
  state.serverDetailTab = tabName;

  document.querySelectorAll('#server-detail-tabs .tab').forEach(t => t.classList.remove('active'));
  tabBtn.classList.add('active');

  document.querySelectorAll('#page-server-detail .tab-content').forEach(c => c.style.display = 'none');
  const target = $('#server-tab-' + tabName);
  if (target) target.style.display = 'block';

  const indicator = $('#tab-indicator');
  if (indicator) {
    indicator.style.left = tabBtn.offsetLeft + 'px';
    indicator.style.width = tabBtn.offsetWidth + 'px';
  }

  if (tabName === 'resources') {
    const container = $('#live-resources-container');
    if (container && container.querySelector('.resource-gauge') === null) {
      fetchLiveResources(state.serverIdentifier);
    }
  }

  const newUrl = `/server/${state.serverId}/${tabName}`;
  history.pushState({ page: 'server', serverId: state.serverId, tab: tabName }, '', newUrl);
}

// ===== DELETE SERVER =====
document.addEventListener('click', function(e) {
  const tabBtn = e.target.closest('.tab');
  if (tabBtn && !tabBtn.classList.contains('active')) {
    e.preventDefault();
    switchTab(tabBtn);
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
    btn.innerHTML = `        <i data-lucide="download" style="width:18px;height:18px"></i> Export My Data`;
  }
}

// ===== INIT =====
function init() {
  const path = window.location.pathname;

  // Skip if admin route - handled by admin.js
  if (path.startsWith('/admin')) return;

  const basePage = path.replace(/^\//, '').split('/')[0] || '';
  const token = localStorage.getItem('zh_token');

  if (token) {
    state.token = token;
    try {
      const user = JSON.parse(localStorage.getItem('zh_user'));
      if (user) state.user = user;
    } catch {}
  }

  if (basePage === 'login' || basePage === 'signup') {
    if (state.token) {
      history.replaceState({ page: 'overview' }, '', '/');
      renderDashboard();
    } else if (basePage === 'login') {
      renderLoginPage();
    } else {
      renderRegisterPage();
    }
  } else if (state.token) {
    api('/servers/overview').then(() => {
      renderDashboard();
      fetchUnreadCount();
      setInterval(fetchUnreadCount, 30000);
    }).catch(() => {
      renderDashboard();
    });
  } else {
    renderLoginPage();
    history.replaceState({ page: 'login' }, '', '/login');
  }

  renderCookieBanner();
}

init();

