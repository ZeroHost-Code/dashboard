function initIcons() { if (window.lucide) lucide.createIcons(); }

function siUrl(slug) {
  return `https://cdn.simpleicons.org/${slug}`;
}

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
  sidebarMode: 'main',
  accountTab: 'info',
  sidebarServersOpen: false,
  sidebarServersLoading: false,
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

let PTERO_URL = '';

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.pteroUrl) PTERO_URL = data.pteroUrl;
  } catch {}
}

fetchConfig();

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

function showModal(title, message, buttonText) {
  let overlay = $('#standalone-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'standalone-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = html`
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:28px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.4);text-align:center" onclick="event.stopPropagation()">
      <div style="margin-bottom:16px;">
        <i data-lucide="mail-check" style="width:40px;height:40px;color:var(--accent-1);"></i>
      </div>
      <h2 style="font-size:1.15rem;font-weight:700;margin-bottom:8px">${title}</h2>
      <p style="font-size:0.88rem;color:var(--text-secondary);line-height:1.6;margin-bottom:20px">${message}</p>
      <button class="btn btn-primary btn-full standalone-modal-ok" style="justify-content:center">${buttonText || 'OK'}</button>
    </div>
  `;
  overlay.style.display = 'flex';
  initIcons();
  overlay.querySelector('.standalone-modal-ok').onclick = () => overlay.remove();
}
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
  const msg = []; for(let i=0;i<len;i++) msg.push(s.charCodeAt(i));
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
  const hash = state.user?.gravatarHash || md5(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}

function base64UrlFromBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bufferFromBase64Url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function prepareWebAuthnOptions(opts) {
  const o = JSON.parse(JSON.stringify(opts));
  if (o.challenge) o.challenge = bufferFromBase64Url(o.challenge);
  if (o.user?.id) o.user.id = bufferFromBase64Url(o.user.id);
  if (o.excludeCredentials) {
    o.excludeCredentials = o.excludeCredentials.map(c => ({
      ...c,
      id: typeof c.id === 'string' ? bufferFromBase64Url(c.id) : c.id,
    }));
  }
  if (o.allowCredentials) {
    o.allowCredentials = o.allowCredentials.map(c => ({
      ...c,
      id: typeof c.id === 'string' ? bufferFromBase64Url(c.id) : c.id,
    }));
  }
  return o;
}

function serializeCredential(cred) {
  const res = {};
  for (const key of Object.keys(cred)) {
    if (key === 'response') {
      res.response = {};
      for (const rKey of Object.keys(cred.response)) {
        const val = cred.response[rKey];
        if (val instanceof ArrayBuffer || val instanceof Uint8Array) {
          res.response[rKey] = base64UrlFromBuffer(val);
        } else if (typeof val === 'function') {
          continue;
        } else {
          res.response[rKey] = val;
        }
      }
      if (cred.response.transports && !res.response.transports) {
        res.response.transports = cred.response.transports;
      }
      if (typeof cred.response.getTransports === 'function') {
        res.response.transports = cred.response.getTransports();
      }
    } else if (key === 'rawId') {
      res.rawId = base64UrlFromBuffer(cred.rawId);
    } else if (key === 'id') {
      res.id = cred.id;
    } else if (key === 'type') {
      res.type = cred.type;
    } else if (key === 'clientExtensionResults') {
      res.clientExtensionResults = cred.clientExtensionResults || {};
    } else if (typeof cred[key] !== 'function') {
      res[key] = cred[key];
    }
  }
  return res;
}

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
  if (res.status === 403 && (data.error === 'Invalid or expired token' || data.error === 'Session expired. Please log in again.')) {
    state.token = null;
    state.user = null;
    localStorage.removeItem('zh_token');
    localStorage.removeItem('zh_user');
    navigateTo('login');
    return;
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
    if (message && message.includes('verify your email')) {
      const email = (form.querySelector('#login-email')?.value || '').trim();
      errorEl.innerHTML = html`
        <span>${escapeHtml(message)}</span>
        <button type="button" class="auth-resend-btn" id="auth-resend-btn" ${!email ? 'disabled' : ''}>Resend verification link</button>
      `;
      const resendBtn = errorEl.querySelector('#auth-resend-btn');
      if (resendBtn) {
        resendBtn.addEventListener('click', async () => {
          if (!email) return;
          resendBtn.disabled = true;
          resendBtn.textContent = 'Sending...';
          try {
            await api('/auth/resend-verification', {
              method: 'POST',
              body: JSON.stringify({ email }),
            });
            resendBtn.textContent = 'Email sent!';
          } catch (err) {
            resendBtn.textContent = 'Failed to send';
            resendBtn.disabled = false;
          }
        });
      }
    } else {
      errorEl.textContent = message;
    }
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

  if (window.innerWidth <= 768) {
    $('#sidebar').classList.remove('open');
  }

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

function showVpnBlockModal() {
  return new Promise((resolve) => {
    const existing = document.getElementById('vpn-block-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'vpn-block-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:10000;display:flex;align-items:center;justify-content:center';
    overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(); } };

    overlay.innerHTML = html`
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.5);text-align:center" onclick="event.stopPropagation()">
        <div style="margin-bottom:16px;">
          <i data-lucide="shield-alert" style="width:48px;height:48px;color:var(--accent-red);"></i>
        </div>
        <h2 style="font-size:1.2rem;font-weight:700;margin-bottom:8px;color:var(--text-primary)">VPN / Proxy Detected</h2>
        <p style="font-size:0.9rem;color:var(--text-secondary);line-height:1.6;margin-bottom:8px">
          For security reasons, VPN and proxy connections are <strong style="color:var(--text-primary)">not allowed</strong> on ZeroHost.
        </p>
        <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;margin-bottom:20px">
          Please disable your VPN or proxy and try again.
        </p>
        <button class="btn btn-primary btn-full vpn-block-ok-btn" style="justify-content:center">
          I understand
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    initIcons();

    overlay.querySelector('.vpn-block-ok-btn').onclick = () => {
      overlay.remove();
      resolve();
    };
  });
}

async function checkVpn() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/check-vpn`);
    const data = await res.json();
    return data.vpn === true;
  } catch {
    return false;
  }
}

// ===== AUTH PAGES =====
function renderLoginPage() {
  const app = $('#app');
  app.innerHTML = html`
    <div class="login-page">
      <div class="login-left">
        <div class="login-left-top">
          <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
          <span>| Dashboard</span>
        </div>
      </div>
      <div class="login-right">
        <div class="login-card">
          <h1 class="auth-title">Welcome back</h1>
          <p class="auth-subtitle">Sign in to your dashboard</p>

          <div id="login-choices">
            <button type="button" class="btn btn-primary btn-full login-choice-btn" id="login-email-btn">
              <i data-lucide="mail" style="width:18px;height:18px"></i>
              Login with E-mail
            </button>
            <button type="button" class="btn btn-ghost btn-full login-choice-btn" id="login-passkey-btn" style="border:1px solid var(--border)">
              <i data-lucide="fingerprint" style="width:18px;height:18px"></i>
              Login with Passkey
            </button>
          </div>

          <div id="login-email-form" style="display:none">
            <form id="login-form">
              <div class="auth-error"></div>
              <div class="form-group">
                <label for="login-email">Email</label>
                <input type="email" id="login-email" placeholder="your@email.com" required autocomplete="webauthn" />
              </div>
              <div class="form-group">
                <label for="login-password">Password</label>
                <input type="password" id="login-password" placeholder="••••••••" required autocomplete="current-password" />
              </div>
              <button type="submit" class="btn btn-primary btn-full" id="login-btn">
                Sign In
              </button>
            </form>
            <button type="button" class="btn btn-ghost btn-full" id="login-back-btn" style="margin-top:12px">
              <i data-lucide="arrow-left" style="width:16px;height:16px"></i>
              Back
            </button>
          </div>

          <div class="auth-footer">
            Don't have an account? <a href="/signup" id="go-register">Create one</a>
          </div>
        </div>
      </div>
    </div>
  `;

  $('#login-email-btn').addEventListener('click', () => {
    $('#login-choices').style.display = 'none';
    $('#login-email-form').style.display = 'block';
    setupPasskeyAutofill();
    initIcons();
  });

  $('#login-back-btn').addEventListener('click', () => {
    $('#login-email-form').style.display = 'none';
    $('#login-choices').style.display = 'block';
    initIcons();
  });

  $('#login-form').addEventListener('submit', handleLogin);
  $('#login-passkey-btn').addEventListener('click', handlePasskeyLogin);
  $('#go-register').addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('signup');
  });

  initIcons();
  setTimeout(initIcons, 100);
}

function renderRegisterPage() {
  const app = $('#app');
  app.innerHTML = html`
    <div class="login-page">
      <div class="login-left">
        <div class="login-left-top">
          <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
          <span>| Dashboard</span>
        </div>
      </div>
      <div class="login-right">
        <div class="login-card">
          <h1 class="auth-title">Create account</h1>
          <p class="auth-subtitle">Start hosting for free</p>
          <form id="register-form">
            <div class="auth-error"></div>
            <div class="form-group">
              <label for="reg-email">Email</label>
              <div class="input-wrap">
                <input type="email" id="reg-email" placeholder="your@email.com" required autocomplete="email" />
                <span class="input-status" id="reg-email-status"></span>
              </div>
              <div class="field-hint" id="reg-email-hint"></div>
            </div>
            <div class="form-group">
              <label for="reg-username">Username</label>
              <div class="input-wrap">
                <input type="text" id="reg-username" placeholder="myusername" required autocomplete="username" />
                <span class="input-status" id="reg-username-status"></span>
              </div>
              <div class="field-hint" id="reg-username-hint"></div>
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
    </div>
  `;

  $('#register-form').addEventListener('submit', handleRegister);
  $('#go-login').addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('login');
  });

  setupRegisterAvailabilityChecks();
}

const registerAvailability = { email: null, username: null };
const registerFocus = { email: false, username: false };
let registerAvailabilityTimer = null;

function setFieldStatus(field, state, message) {
  const statusEl = $(`#reg-${field}-status`);
  const hintEl = $(`#reg-${field}-hint`);
  if (!statusEl) return;
  statusEl.className = `input-status ${state || ''}`;
  if (state === 'checking') {
    statusEl.innerHTML = '<span class="spinner" style="width:16px;height:16px;"></span>';
  } else if (state === 'ok') {
    statusEl.innerHTML = '<i data-lucide="check" style="width:18px;height:18px"></i>';
  } else if (state === 'taken') {
    statusEl.innerHTML = '<i data-lucide="x" style="width:18px;height:18px"></i>';
  } else {
    statusEl.innerHTML = '';
  }
  const showText = registerFocus[field] && (state === 'ok' || state === 'taken');
  if (hintEl) {
    hintEl.textContent = showText ? message : '';
    hintEl.className = `field-hint ${showText ? state : ''}`;
  }
  if (state === 'taken' || state === 'ok') initIcons();
}

function renderStoredStatus(field) {
  const availability = registerAvailability[field];
  if (availability === true) {
    setFieldStatus(field, 'ok', 'Available');
  } else if (availability === false) {
    setFieldStatus(field, 'taken', field === 'email' ? 'This email is already taken' : 'This username is already taken');
  } else {
    setFieldStatus(field, '');
  }
}

function setupRegisterAvailabilityChecks() {
  const emailInput = $('#reg-email');
  const usernameInput = $('#reg-username');
  if (!emailInput || !usernameInput) return;

  const runCheck = async () => {
    const email = emailInput.value.trim();
    const username = usernameInput.value.trim();

    if (!email && !username) {
      registerAvailability.email = null;
      registerAvailability.username = null;
      setFieldStatus('email', '');
      setFieldStatus('username', '');
      return;
    }

    if (email && !validateRegEmail(email)) {
      setFieldStatus('email', '');
      registerAvailability.email = null;
    }
    if (username && !validateRegUsername(username)) {
      setFieldStatus('username', '');
      registerAvailability.username = null;
    }

    setFieldStatus('email', email && validateRegEmail(email) ? 'checking' : '');
    setFieldStatus('username', username && validateRegUsername(username) ? 'checking' : '');

    try {
      const params = new URLSearchParams();
      if (email && validateRegEmail(email)) params.set('email', email);
      if (username && validateRegUsername(username)) params.set('username', username);
      const data = await api(`/auth/check-availability?${params.toString()}`);
      if (email && validateRegEmail(email)) {
        registerAvailability.email = !!data.email?.available;
        renderStoredStatus('email');
      }
      if (username && validateRegUsername(username)) {
        registerAvailability.username = !!data.username?.available;
        renderStoredStatus('username');
      }
    } catch {
      setFieldStatus('email', '');
      setFieldStatus('username', '');
    }
  };

  const onInput = () => {
    clearTimeout(registerAvailabilityTimer);
    registerAvailabilityTimer = setTimeout(runCheck, 400);
  };

  const onFocus = (field) => {
    registerFocus[field] = true;
    renderStoredStatus(field);
  };

  const onBlur = (field) => {
    registerFocus[field] = false;
    renderStoredStatus(field);
  };

  emailInput.addEventListener('input', onInput);
  usernameInput.addEventListener('input', onInput);
  emailInput.addEventListener('focus', () => onFocus('email'));
  emailInput.addEventListener('blur', () => onBlur('email'));
  usernameInput.addEventListener('focus', () => onFocus('username'));
  usernameInput.addEventListener('blur', () => onBlur('username'));
}

function validateRegEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRegUsername(username) {
  return /^[a-zA-Z0-9_-]{3,32}$/.test(username);
}

async function handleLogin(e) {
  e.preventDefault();
  hideError(e.target);
  const btn = $('#login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in...';

  try {
    if (await checkVpn()) {
      await showVpnBlockModal();
      return;
    }

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
    if (err.message && err.message.toLowerCase().includes('vpn')) {
      await showVpnBlockModal();
    } else {
      showError(e.target, err.message);
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
}

async function completePasskeyLogin(credential) {
  if (await checkVpn()) {
    await showVpnBlockModal();
    return;
  }

  const data = await api('/auth/passkeys/login/complete', {
    method: 'POST',
    body: JSON.stringify({
      response: serializeCredential(credential),
    }),
  });
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('zh_token', data.token);
  localStorage.setItem('zh_user', JSON.stringify(data.user));
  history.replaceState({ page: 'overview' }, '', '/');
  renderDashboard();
}

let passkeyAbortController = null;

async function setupPasskeyAutofill() {
  if (passkeyAbortController) {
    passkeyAbortController.abort();
    passkeyAbortController = null;
  }
  if (!navigator.credentials || typeof navigator.credentials.get !== 'function') return;

  try {
    const beginData = await api('/auth/passkeys/login/begin', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    passkeyAbortController = new AbortController();
    const credential = await navigator.credentials.get({
      publicKey: prepareWebAuthnOptions(beginData.options),
      mediation: 'conditional',
      signal: passkeyAbortController.signal,
    });

    if (credential) {
      await completePasskeyLogin(credential);
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'NotAllowedError') return;
    console.error('Passkey autofill error:', err.message);
  }
}

async function handlePasskeyLogin() {
  const btn = $('#login-passkey-btn');
  const errorEl = $('#login-form .auth-error');
  if (errorEl) errorEl.classList.remove('show');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    if (await checkVpn()) {
      await showVpnBlockModal();
      return;
    }

    const email = $('#login-email').value.trim();
    const body = email ? { email } : {};
    const beginData = await api('/auth/passkeys/login/begin', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const credential = await navigator.credentials.get({
      publicKey: prepareWebAuthnOptions(beginData.options),
    });

    await completePasskeyLogin(credential);
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes('vpn')) {
      await showVpnBlockModal();
    } else if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.classList.add('show');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="fingerprint" style="width:18px;height:18px"></i> Login with Passkey';
    initIcons();
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

  if (registerAvailability.email === false) {
    showError(e.target, 'This email is already taken. Please choose another one.');
    return;
  }
  if (registerAvailability.username === false) {
    showError(e.target, 'This username is already taken. Please choose another one.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating...';

  try {
    if (await checkVpn()) {
      await showVpnBlockModal();
      return;
    }

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
    renderVerificationSent($('#reg-email').value);
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes('vpn')) {
      await showVpnBlockModal();
    } else {
      showError(e.target, err.message);
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Create Account';
  }
}

async function renderVerifyEmail(token) {
  const app = $('#app');
  app.innerHTML = html`
    <div class="login-page">
      <div class="login-left">
        <div class="login-left-top">
          <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
          <span>| Dashboard</span>
        </div>
      </div>
      <div class="login-right">
        <div class="login-card" style="text-align:center;">
          <div style="margin:0 auto 24px;width:fit-content;">
            <span class="spinner" style="width:48px;height:48px;"></span>
          </div>
          <h1 class="auth-title">Verifying your email...</h1>
        </div>
      </div>
    </div>
  `;
  initIcons();

  if (!token) {
    app.innerHTML = html`
      <div class="login-page">
        <div class="login-left">
          <div class="login-left-top">
            <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
            <span>| Dashboard</span>
          </div>
        </div>
        <div class="login-right">
          <div class="login-card" style="text-align:center;">
            <div style="margin:0 auto 24px;width:fit-content;">
              <i data-lucide="x-circle" style="width:48px;height:48px;color:var(--accent-red);"></i>
            </div>
            <h1 class="auth-title">Invalid Link</h1>
            <p class="auth-subtitle">This verification link is invalid. Please try registering again.</p>
            <div style="margin-top:24px;">
              <a href="/signup" class="btn btn-primary">Create Account</a>
            </div>
          </div>
        </div>
      </div>
    `;
    initIcons();
    return;
  }

  try {
    const data = await api(`/auth/verify-email?token=${encodeURIComponent(token)}`);

    if (data.alreadyVerified) {
      app.innerHTML = html`
        <div class="login-page">
          <div class="login-left">
            <div class="login-left-top">
              <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
              <span>| Dashboard</span>
            </div>
          </div>
          <div class="login-right">
            <div class="login-card" style="text-align:center;">
              <div style="margin:0 auto 24px;width:fit-content;">
                <i data-lucide="check-circle" style="width:48px;height:48px;color:var(--accent-green);"></i>
              </div>
              <h1 class="auth-title">Already Verified</h1>
              <p class="auth-subtitle">Your email was already verified. You can sign in below.</p>
              <div style="margin-top:24px;">
                <a href="/login" class="btn btn-primary">Sign In</a>
              </div>
            </div>
          </div>
        </div>
      `;
      initIcons();
      return;
    }

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('zh_token', data.token);
    localStorage.setItem('zh_user', JSON.stringify(data.user));
    history.replaceState({ page: 'overview' }, '', '/');
    renderDashboard();
    checkAndStartOnboarding();
    showToast('Email verified successfully!', 'success');
  } catch (err) {
    app.innerHTML = html`
      <div class="login-page">
        <div class="login-left">
          <div class="login-left-top">
            <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
            <span>| Dashboard</span>
          </div>
        </div>
        <div class="login-right">
          <div class="login-card" style="text-align:center;">
            <div style="margin:0 auto 24px;width:fit-content;">
              <i data-lucide="x-circle" style="width:48px;height:48px;color:var(--accent-red);"></i>
            </div>
            <h1 class="auth-title">Verification Failed</h1>
            <p class="auth-subtitle">${escapeHtml(err.message)}</p>
            <div style="margin-top:24px;">
              <a href="/signup" class="btn btn-primary">Create Account</a>
            </div>
          </div>
        </div>
      </div>
    `;
    initIcons();
  }
}

async function renderChangeEmailVerify(token) {
  const app = $('#app');

  if (!token) {
    app.innerHTML = html`
      <div class="auth-page">
        <div class="auth-card" style="text-align:center;">
          <div style="margin:24px 0 16px;">
            <i data-lucide="x-circle" style="width:48px;height:48px;color:var(--accent-red);"></i>
          </div>
          <h1 class="auth-title">Invalid Link</h1>
          <p class="auth-subtitle">This email change link is invalid or has expired.</p>
          <div style="margin-top:24px;">
            <a href="/login" class="btn btn-primary">Sign In</a>
          </div>
        </div>
      </div>
    `;
    initIcons();
    return;
  }

  app.innerHTML = html`
    <div class="login-page">
      <div class="login-left">
        <div class="login-left-top">
          <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
          <span>| Dashboard</span>
        </div>
      </div>
      <div class="login-right">
        <div class="login-card">
          <div style="margin:0 auto 24px;width:fit-content;">
            <span class="spinner" style="width:36px;height:36px;"></span>
          </div>
          <h1 class="auth-title" style="text-align:center">Verifying link...</h1>
        </div>
      </div>
    </div>
  `;
  initIcons();

  try {
    const data = await api(`/auth/change-email/verify?token=${encodeURIComponent(token)}`);

    app.innerHTML = html`
      <div class="login-page">
        <div class="login-left">
          <div class="login-left-top">
            <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
            <span>| Dashboard</span>
          </div>
        </div>
        <div class="login-right">
          <div class="login-card">
            <h1 class="auth-title">Enter verification code</h1>
            <p class="auth-subtitle">A 6-digit code was sent to <strong style="color:var(--text-primary)">${escapeHtml(data.pendingEmail)}</strong></p>
            <form id="change-email-code-form">
              <div class="auth-error"></div>
              <div class="form-group">
                <label for="change-email-code">Verification Code</label>
                <input type="text" id="change-email-code" placeholder="000000" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" required style="text-align:center;font-size:1.4rem;letter-spacing:8px;font-family:'JetBrains Mono',monospace;" />
              </div>
              <button type="submit" class="btn btn-primary btn-full" id="change-email-code-btn">
                Confirm
              </button>
            </form>
            <button type="button" class="btn btn-ghost btn-full" id="change-email-resend-btn" style="margin-top:12px;border:1px solid var(--border)">
              Resend code
            </button>
            <div class="auth-footer">
              <a href="/account/info" id="change-email-cancel">Cancel</a>
            </div>
          </div>
        </div>
      </div>
    `;

    $('#change-email-code-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#change-email-code-btn');
      const errorEl = $('#change-email-code-form .auth-error');
      const code = $('#change-email-code').value.trim();

      if (code.length !== 6) {
        errorEl.textContent = 'Please enter the 6-digit code';
        errorEl.classList.add('show');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';

      try {
        const result = await api('/auth/change-email/confirm', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
        state.token = result.token;
        state.user = result.user;
        localStorage.setItem('zh_token', result.token);
        localStorage.setItem('zh_user', JSON.stringify(result.user));
        showToast('Email updated successfully', 'success');
        navigateTo('account/info');
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.add('show');
      } finally {
        btn.disabled = false;
        btn.innerHTML = 'Confirm';
      }
    });

    $('#change-email-resend-btn').addEventListener('click', async () => {
      const btn = $('#change-email-resend-btn');
      btn.disabled = true;
      try {
        await api(`/auth/change-email/verify?token=${encodeURIComponent(token)}`);
        showToast('New code sent', 'success');
        let countdown = 30;
        btn.textContent = `Resend code (${countdown}s)`;
        const timer = setInterval(() => {
          countdown--;
          if (countdown <= 0) {
            clearInterval(timer);
            btn.disabled = false;
            btn.textContent = 'Resend code';
          } else {
            btn.textContent = `Resend code (${countdown}s)`;
          }
        }, 1000);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });

    $('#change-email-cancel').addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('login');
    });

    initIcons();
  } catch (err) {
    app.innerHTML = html`
      <div class="login-page">
        <div class="login-left">
          <div class="login-left-top">
            <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
            <span>| Dashboard</span>
          </div>
        </div>
        <div class="login-right">
          <div class="login-card" style="text-align:center;">
            <div style="margin:0 auto 24px;width:fit-content;">
              <i data-lucide="x-circle" style="width:48px;height:48px;color:var(--accent-red);"></i>
            </div>
            <h1 class="auth-title">Link expired</h1>
            <p class="auth-subtitle">${escapeHtml(err.message)}</p>
            <div style="margin-top:24px;">
              <a href="/login" class="btn btn-primary">Sign In</a>
            </div>
          </div>
        </div>
      </div>
    `;
    initIcons();
  }
}

function renderVerificationSent(email) {
  const app = $('#app');
  app.innerHTML = html`
    <div class="login-page">
      <div class="login-left">
        <div class="login-left-top">
          <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
          <span>| Dashboard</span>
        </div>
      </div>
      <div class="login-right">
        <div class="login-card" style="text-align:center;">
          <div style="margin:0 auto 24px;width:fit-content;">
            <i data-lucide="mail-check" style="width:48px;height:48px;color:var(--accent-orange);"></i>
          </div>
          <h1 class="auth-title">Check your inbox</h1>
          <p class="auth-subtitle" style="max-width:360px;margin:0 auto 8px;">
            We sent a verification email to <strong>${escapeHtml(email)}</strong>.
            Click the link in the email to activate your account.
          </p>
          <p style="font-size:0.8rem;color:var(--text-muted);">Can't find it? Check your spam folder.</p>
          <div style="margin-top:24px;">
            <a href="/login" class="btn btn-primary" id="go-to-login-after-register">Go to Sign In</a>
          </div>
        </div>
      </div>
    </div>
  `;
  initIcons();

  $('#go-to-login-after-register').addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('login');
  });
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
        <nav class="sidebar-nav" id="sidebar-nav"></nav>
        <div class="sidebar-tooltip" id="sidebar-tooltip"></div>
        <div class="sidebar-footer">
          <div class="sidebar-user-wrapper">
            <div class="user-info" id="sidebar-user-info" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer">
              <div style="display:flex;align-items:center;gap:10px">
                <div class="user-avatar" id="avatar-container"><img src="${gravatarUrl(state.user?.email, 32)}" alt="" width="32" height="32" style="border-radius:50%;width:32px;height:32px;object-fit:cover"/></div>
                <div>
                  <div class="user-name">${state.user?.username || 'User'}</div>
                  <div class="user-email">${state.user?.email || ''}</div>
                </div>
              </div>

            </div>
            <div class="sidebar-user-dropdown" id="sidebar-user-dropdown">
              <a class="sidebar-user-dropdown-item" id="user-dropdown-settings">
                <i data-lucide="settings" style="width:16px;height:16px"></i>
                Settings
              </a>
              <a class="sidebar-user-dropdown-item" id="user-dropdown-tour">
                <i data-lucide="map" style="width:16px;height:16px"></i>
                Take a Tour
              </a>
              <a class="sidebar-user-dropdown-item" id="user-dropdown-logout">
                <i data-lucide="log-out" style="width:16px;height:16px"></i>
                Logout
              </a>
            </div>
          </div>
          <div style="border-top:1px solid var(--border);margin:6px -12px 0"></div>
          <div style="padding:8px 12px 0;display:flex;gap:16px;justify-content:center;flex-wrap:wrap">

          </div>
          <div style="padding:4px 0 8px;text-align:center;font-size:0.7rem;color:var(--text-muted);letter-spacing:0.05em">v1.0.8</div>
        </div>
        <div class="sidebar-resizer" id="sidebar-resizer"></div>
      </aside>
      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>

      <div class="notif-panel" id="notif-panel">
        <div class="notif-panel-header">
          <h3>Notifications</h3>
          <div class="notif-header-actions">
            <button class="notif-mark-all" id="notif-mark-all">Mark all read</button>
            <button class="notif-close-mobile" id="notif-close-mobile" aria-label="Close notifications">
              <i data-lucide="x" style="width:20px;height:20px"></i>
            </button>
          </div>
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

  $('#sidebar-user-info').addEventListener('click', (e) => {
    if (e.target.closest('.sidebar-user-dropdown')) return;
    if ($('#sidebar').classList.contains('collapsed')) {
      navigateTo('account/info');
    } else {
      toggleUserDropdown();
    }
  });

  $('#user-dropdown-settings').addEventListener('click', (e) => {
    e.preventDefault();
    closeUserDropdown();
    navigateTo('account/info');
  });

  $('#user-dropdown-tour').addEventListener('click', (e) => {
    e.preventDefault();
    closeUserDropdown();
    startOnboarding();
  });

  $('#user-dropdown-logout').addEventListener('click', async (e) => {
    e.preventDefault();
    closeUserDropdown();
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    state.token = null;
    state.user = null;
    localStorage.removeItem('zh_token');
    localStorage.removeItem('zh_user');
    navigateTo('login');
  });

  $('#notif-backdrop').addEventListener('click', closeNotifPanel);
  $('#notif-close-mobile').addEventListener('click', closeNotifPanel);

  $('#notif-mark-all').addEventListener('click', markAllAsRead);

  $('#sidebar-logo-link').addEventListener('click', (e) => {
    e.preventDefault();
    if (window.innerWidth <= 768) return;
    toggleSidebarCollapse();
  });

  $('#hamburger-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  $('#sidebar-backdrop').addEventListener('click', () => {
    $('#sidebar').classList.remove('open');
  });

  initSidebarResize();

  initSidebarTooltip();

  renderSidebarNav();

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
    const item = e.target.closest('.nav-item, .nav-parent');
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

function buildServerSubList() {
  if (state.sidebarServersLoading) return html`<div class="nav-sub-empty"><span class="spinner"></span> Loading...</div>`;
  if (state.servers.length === 0) return html`<div class="nav-sub-empty">No servers</div>`;
  return state.servers.map(s => {
    const isInstalling = s.status === 'installing' || s.installed === 0 || s.installed === '0' || s.installed === false;
    const isSuspended = s.status === 'suspended';
    const dotClass = isSuspended ? 'dot-suspended' : (isInstalling ? 'dot-installing' : 'dot-active');
    const isActive = state.currentPage === 'server' && state.serverId === s.id;
    return html`
      <a class="nav-sub-item ${isActive ? 'active' : ''}" data-server-nav="${s.id}" href="/server/${s.id}">
        <span class="nav-sub-dot ${dotClass}"></span>
        ${escapeHtml(s.name)}
      </a>
    `;
  }).join('');
}

function renderSidebarNav() {
  const nav = $('#sidebar-nav');
  if (!nav) return;

  let indicator = document.getElementById('nav-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'nav-indicator';
    indicator.id = 'nav-indicator';
    nav.appendChild(indicator);
  }

  let itemsContainer = nav.querySelector('.nav-items');
  if (!itemsContainer) {
    itemsContainer = document.createElement('div');
    itemsContainer.className = 'nav-items';
    nav.appendChild(itemsContainer);
  }

  if (state.sidebarMode === 'account') {
    itemsContainer.innerHTML = html`
      <div class="nav-section-label">Account</div>
      <a class="nav-item ${state.accountTab === 'info' ? 'active' : ''}" data-account-page="info" href="/account/info">
        <i data-lucide="user"></i>
        Account Info
      </a>
      <a class="nav-item ${state.accountTab === 'security' ? 'active' : ''}" data-account-page="security" href="/account/security">
        <i data-lucide="lock"></i>
        Security
      </a>
      <a class="nav-item ${state.accountTab === 'logs' ? 'active' : ''}" data-account-page="logs" href="/account/logs">
        <i data-lucide="file-text"></i>
        Logs
      </a>
      <a class="nav-item ${state.accountTab === 'dangerous' ? 'active' : ''}" data-account-page="dangerous" href="/account/dangerous">
        <i data-lucide="triangle-alert"></i>
        Dangerous
      </a>
      <div style="margin-top:auto;padding-top:16px;border-top:1px solid var(--border);margin-left:12px;margin-right:12px"></div>
      <a class="nav-item" data-page="overview" href="/">
        <i data-lucide="arrow-left"></i>
        Back to Dashboard
      </a>
    `;
  } else {
    itemsContainer.innerHTML = html`
      <div class="nav-section-label">Main</div>
      <a class="nav-item ${state.currentPage === 'overview' ? 'active' : ''}" data-page="overview" href="/">
        <i data-lucide="grid-3x3"></i>
        Overview
      </a>
      <div class="nav-parent ${state.sidebarServersOpen ? 'open' : ''} ${(state.currentPage === 'servers' || state.currentPage === 'server') ? 'active' : ''}" id="nav-servers-toggle">
        <i data-lucide="server"></i>
        <span class="nav-parent-label">My Servers</span>
        <svg class="nav-parent-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </div>
      <div class="nav-sub-list ${state.sidebarServersOpen ? 'open' : ''}" id="nav-servers-list">
        ${buildServerSubList()}
      </div>
      <a class="nav-item" id="nav-notifications" href="#">
        <span style="position:relative;display:inline-flex">
          <i data-lucide="bell"></i>
          <span class="notif-badge" id="notif-badge"></span>
        </span>
        Notifications
      </a>
      <div class="nav-section-label">Actions</div>
      <a class="nav-item ${state.currentPage === 'create' ? 'active' : ''}" data-page="create" href="/create">
        <i data-lucide="plus"></i>
        Create Server
      </a>
      <div class="nav-section-label">Links</div>
      ${state.user?.isAdmin ? html`
      <a class="nav-item" href="/admin">
        <i data-lucide="shield"></i>
        Switch Admin
      </a>
      ` : ''}
      <a class="nav-item" href="https://discord.zero-host.org" target="_blank">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
        Discord
      </a>
      <a class="nav-item" href="https://www.trustpilot.com/review/zero-host.org" target="_blank">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.227 16.67l2.19 6.742-7.413-5.388 5.223-1.354zM24 9.31h-9.165L12.005.589l-2.84 8.723L0 9.3l7.422 5.397-2.84 8.714 7.422-5.388 4.583-3.326L24 9.311z"/></svg>
        Leave a Review
      </a>
    `;
  }

  itemsContainer.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  itemsContainer.querySelectorAll('.nav-item[data-account-page]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('account/' + item.dataset.accountPage);
    });
  });

  const notifItem = itemsContainer.querySelector('#nav-notifications');
  if (notifItem) {
    notifItem.addEventListener('click', (e) => {
      e.preventDefault();
      itemsContainer.querySelectorAll('.nav-item, .nav-parent').forEach(n => n.classList.remove('active'));
      notifItem.classList.add('active');
      updateNavIndicator();
      toggleNotifPanel();
    });
  }

  const serversToggle = itemsContainer.querySelector('#nav-servers-toggle');
  if (serversToggle) {
    serversToggle.addEventListener('click', async (e) => {
      e.preventDefault();
      state.sidebarServersOpen = !state.sidebarServersOpen;
      serversToggle.classList.toggle('open', state.sidebarServersOpen);
      const subList = document.querySelector('#nav-servers-list');
      if (subList) subList.classList.toggle('open', state.sidebarServersOpen);
      if (state.sidebarServersOpen && state.servers.length === 0 && !state.sidebarServersLoading) {
        state.sidebarServersLoading = true;
        const subListEl = document.querySelector('#nav-servers-list');
        if (subListEl) subListEl.innerHTML = html`<div class="nav-sub-empty"><span class="spinner"></span> Loading...</div>`;
        try {
          const data = await api('/servers/list');
          state.servers = data.servers || [];
        } catch (err) {
          state.servers = [];
        }
        state.sidebarServersLoading = false;
        const subListRefresh = document.querySelector('#nav-servers-list');
        if (subListRefresh) {
          subListRefresh.innerHTML = buildServerSubList();
          subListRefresh.querySelectorAll('.nav-sub-item[data-server-nav]').forEach(item => {
            item.addEventListener('click', (e) => {
              e.preventDefault();
              navigateTo('server/' + item.dataset.serverNav);
            });
          });
          initIcons();
        }
      }
      navigateTo('servers');
    });
  }

  itemsContainer.querySelectorAll('.nav-sub-item[data-server-nav]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('server/' + item.dataset.serverNav);
    });
  });

  if (state.sidebarMode !== 'account' && state.servers.length === 0 && !state.sidebarServersLoading) {
    state.sidebarServersLoading = true;
    api('/servers/list').then(data => {
      state.servers = data.servers || [];
      state.sidebarServersLoading = false;
      const subList = document.querySelector('#nav-servers-list');
      if (subList) {
        subList.innerHTML = buildServerSubList();
        subList.querySelectorAll('.nav-sub-item[data-server-nav]').forEach(item => {
          item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo('server/' + item.dataset.serverNav);
          });
        });
      }
    }).catch(() => {
      state.sidebarServersLoading = false;
    });
  }

  updateNavIndicator();
  initIcons();
}

let userDropdownOpen = false;

function toggleUserDropdown() {
  const dropdown = $('#sidebar-user-dropdown');
  if (!dropdown) return;
  userDropdownOpen = !userDropdownOpen;
  dropdown.classList.toggle('open', userDropdownOpen);
}

function closeUserDropdown() {
  const dropdown = $('#sidebar-user-dropdown');
  if (!dropdown) return;
  userDropdownOpen = false;
  dropdown.classList.remove('open');
}

document.addEventListener('click', (e) => {
  if (userDropdownOpen && !e.target.closest('.sidebar-user-wrapper')) {
    closeUserDropdown();
  }
});

function navigateTo(page) {
  if (state.notifPanelOpen) closeNotifPanel();
  const sidebar = $('#sidebar');
  if (sidebar) sidebar.classList.remove('open');
  if (passkeyAbortController) {
    passkeyAbortController.abort();
    passkeyAbortController = null;
  }
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
  if (basePage === 'verify-email') {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    renderVerifyEmail(token);
    history.replaceState({ page: 'verify-email' }, '', window.location.pathname + window.location.search);
    return;
  }
  if (basePage === 'change-email') {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    renderChangeEmailVerify(token);
    history.replaceState({ page: 'change-email' }, '', window.location.pathname + window.location.search);
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
  document.querySelectorAll('.nav-item, .nav-parent').forEach(n => n.classList.remove('active'));

  state.currentPage = basePage;
  state.serverId = param ? parseInt(param) : null;
  state.serverDetailTab = tab || 'info';

  const isAccountPage = basePage === 'account';
  const newSidebarMode = isAccountPage ? 'account' : 'main';
  if (state.sidebarMode !== newSidebarMode) {
    state.sidebarMode = newSidebarMode;
    renderSidebarNav();
  }

  if (basePage === 'server' || basePage === 'servers') {
    const parent = document.querySelector('#nav-servers-toggle');
    if (parent) parent.classList.add('active');
  } else if (state.sidebarServersOpen) {
    state.sidebarServersOpen = false;
    const parent = document.querySelector('#nav-servers-toggle');
    const subList = document.querySelector('#nav-servers-list');
    if (parent) parent.classList.remove('open');
    if (subList) {
      subList.style.transition = 'none';
      subList.classList.remove('open');
      void subList.offsetHeight;
      subList.style.transition = '';
    }
  }
  const targetNav = document.querySelector(`.nav-item[data-page="${basePage}"]`);
  if (targetNav) targetNav.classList.add('active');
  updateNavIndicator();

  const url = basePage === 'overview' && !param ? '/' : `/${page}`;
  history.pushState({ page: basePage, serverId: state.serverId, sidebarMode: state.sidebarMode }, '', url);

  if (basePage === 'server' && state.serverId) {
    const targetPage = $('#page-server-detail');
    if (targetPage) targetPage.classList.add('active');
    renderServerDetail(state.serverId);
  } else {
    const targetPage = $(`#page-${basePage}`);
    if (targetPage) targetPage.classList.add('active');

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
      const accountTab = param || 'info';
      state.accountTab = accountTab;
      renderAccountTab(accountTab);
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
  const activeNav = document.querySelector('.nav-item.active, .nav-parent.active');
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
  if (basePage === 'verify-email') {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    renderVerifyEmail(token);
    return;
  }
  if (!state.token) { renderLoginPage(); return; }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .nav-parent').forEach(n => n.classList.remove('active'));

  state.currentPage = basePage;
  state.serverId = param ? parseInt(param) : null;
  state.serverDetailTab = tab || 'info';

  const isAccountPage = basePage === 'account';
  const newSidebarMode = isAccountPage ? 'account' : 'main';
  if (state.sidebarMode !== newSidebarMode) {
    state.sidebarMode = newSidebarMode;
    renderSidebarNav();
  }

  if (basePage === 'server' || basePage === 'servers') {
    const parent = document.querySelector('#nav-servers-toggle');
    if (parent) parent.classList.add('active');
  } else if (state.sidebarServersOpen) {
    state.sidebarServersOpen = false;
    const parent = document.querySelector('#nav-servers-toggle');
    const subList = document.querySelector('#nav-servers-list');
    if (parent) parent.classList.remove('open');
    if (subList) {
      subList.style.transition = 'none';
      subList.classList.remove('open');
      void subList.offsetHeight;
      subList.style.transition = '';
    }
  }
  const targetNav = document.querySelector(`.nav-item[data-page="${basePage}"]`);
  if (targetNav) targetNav.classList.add('active');
  updateNavIndicator();

  if (basePage === 'server' && state.serverId) {
    const targetPage = $('#page-server-detail');
    if (targetPage) targetPage.classList.add('active');
    renderServerDetail(state.serverId);
  } else {
    const targetPage = $(`#page-${basePage}`);
    if (targetPage) targetPage.classList.add('active');

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
      const accountTab = param || 'info';
      state.accountTab = accountTab;
      renderAccountTab(accountTab);
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
  passkey_login: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/><path d="M12 17v3"/><path d="M9.5 7.5L12 10l2.5-2.5"/><path d="M7 12h.01"/><path d="M17 12h.01"/></svg>',
  passkey_registered: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/><path d="M12 17v3"/><path d="M15 7l-3 3-2-2"/><path d="M18.5 8.5a2.121 2.121 0 0 1-3 3"/></svg>',
  email_verified: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="M9 12l2 2 4-4"/></svg>',
  passkey_deleted: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/><path d="M12 17v3"/><path d="M9.5 7.5L14.5 12.5"/><path d="M14.5 7.5L9.5 12.5"/></svg>',
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
    passkey_login: 'Signed in with passkey',
    passkey_registered: 'Passkey registered',
    email_verified: 'Email verified',
    passkey_deleted: 'Passkey deleted',
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
      <td data-label="Name"><strong><a href="/server/${s.id}" onclick="event.preventDefault();navigateTo('server/${s.id}')" style="color:inherit;text-decoration:none">${escapeHtml(s.name)}</a></strong></td>
      <td data-label="Egg"><span class="server-detail-tag">${eggName}</span></td>
      <td data-label="Allocation"><span class="server-detail-tag">${allocStr}</span></td>
      <td data-label="Status">
        <span class="server-card-status ${statusClass}">${statusLabel}</span>
      </td>
      <td data-label="Actions">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
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
      initIcons();
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
      ${createState.nests.map(n => {
        const unavail = n.unavailable;
        return html`
          <div class="nest-card ${unavail ? 'unavailable' : ''} ${createState.selectedNest?.pteroNestId === n.pteroNestId ? 'selected' : ''}" data-nest-id="${n.pteroNestId}" ${unavail ? 'style="opacity:0.5;pointer-events:none"' : ''}>
            <div class="nest-card-logo">
              ${n.logo ? (n.logo.startsWith('si:') ? html`<img src="${siUrl(n.logo.slice(3))}" alt="" />` : n.logo.startsWith('lucide:') ? html`<i data-lucide="${n.logo.slice(7)}" style="width:40px;height:40px"></i>` : html`<img src="${n.logo}" alt="" />`) : html`<i data-lucide="box" style="width:40px;height:40px;color:var(--text-secondary)"></i>`}
            </div>
            <div class="nest-card-name">${escapeHtml(n.name)}</div>
            ${n.description ? html`<div class="nest-card-desc">${escapeHtml(n.description)}</div>` : ''}
            ${unavail ? html`<div class="nest-card-badge" style="margin-top:8px;display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;background:rgba(239,68,68,0.15);color:var(--accent-red)">Unavailable</div>` : ''}
          </div>
        `;
      }).join('')}
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
    const unavail = e.unavailable;
    return html`
      <div class="egg-card ${unavail ? 'unavailable' : ''} ${createState.selectedEgg?.eggId === e.eggId ? 'selected' : ''}" data-egg-id="${e.eggId}" ${unavail ? 'style="opacity:0.5;pointer-events:none"' : ''}>
        <div class="egg-card-logo">
          ${e.logo ? (e.logo.startsWith('si:') ? html`<img src="${siUrl(e.logo.slice(3))}" alt="" />` : e.logo.startsWith('lucide:') ? html`<i data-lucide="${e.logo.slice(7)}" style="width:32px;height:32px"></i>` : html`<img src="${e.logo}" alt="" />`) : html`<i data-lucide="egg" style="width:32px;height:32px;color:var(--text-secondary)"></i>`}
        </div>
        <div class="egg-card-info">
          <div class="egg-card-name">${escapeHtml(e.name)}</div>
          ${e.description ? html`<div class="egg-card-desc">${escapeHtml(e.description)}</div>` : ''}
          ${unavail ? html`<div class="egg-card-badge" style="margin-top:6px;display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;background:rgba(239,68,68,0.15);color:var(--accent-red)">Unavailable</div>` : ''}
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
        <div class="wizard-subsection" style="margin-top:24px;max-width:480px">
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
    <div class="wizard-actions" style="max-width:480px">
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
        <span class="server-detail-tag">${egg?.memory_limit != null ? egg.memory_limit + ' MB' : '512 MB'} RAM</span>
        <span class="server-detail-tag">${egg?.cpu_limit != null ? egg.cpu_limit + '%' : '50%'} CPU</span>
        <span class="server-detail-tag">${egg?.disk_limit != null ? (egg.disk_limit / 1024).toFixed(1) + ' GB' : '3 GB'} Disk</span>
      </div>
    </div>
    <div style="margin:20px 0;max-width:480px;width:100%">
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
function renderAccountTab(tab) {
  const el = $('#page-account');
  state.accountTab = tab;

  const pageTitle = {
    info: 'Account Info',
    security: 'Security',
    logs: 'Activity Log',
    dangerous: 'Dangerous Zone',
  }[tab] || 'Account';

  const pageSubtitle = {
    info: 'Manage your account details and API keys',
    security: 'Password and authentication settings',
    logs: 'All account activity',
    dangerous: 'Delete your account or export your data (RGPD)',
  }[tab] || '';

  el.innerHTML = html`
    <div class="page-header">
      <h1 class="page-title">${pageTitle}</h1>
      <p class="page-subtitle">${pageSubtitle}</p>
    </div>
    <div class="account-grid" id="account-tab-content"></div>
  `;

  if (tab === 'info') renderAccountInfoTab();
  else if (tab === 'security') renderAccountSecurityTab();
  else if (tab === 'logs') renderAccountLogsTab();
  else if (tab === 'dangerous') renderAccountDangerousTab();

  initIcons();

  document.querySelectorAll('.nav-item[data-account-page]').forEach(n => {
    n.classList.toggle('active', n.dataset.accountPage === tab);
  });
  updateNavIndicator();
}

function renderAccountInfoTab() {
  const container = $('#account-tab-content');
  container.innerHTML = html`
    <div class="card">
      <h2 class="card-title" style="margin-bottom:20px">Profile Picture</h2>
      <p style="color:var(--text-secondary);font-size:0.85rem;line-height:1.6;margin-bottom:12px">
        Your profile picture is provided by <a href="https://gravatar.com" target="_blank">Gravatar</a>.
        To change it, update your avatar on <a href="https://gravatar.com" target="_blank">gravatar.com</a> using this account's email address.
      </p>
      <div style="display:flex;align-items:center;gap:12px;margin-top:12px">
        <img src="${gravatarUrl(state.user?.email, 64)}" alt="" width="64" height="64" style="border-radius:8px;width:64px;height:64px;object-fit:cover" />
        <div>
          <div style="font-weight:500">${state.user?.email || ''}</div>
          <div style="font-size:0.82rem;color:var(--text-muted)">Gravatar</div>
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
  `;

  $('#change-email-form').addEventListener('submit', handleChangeEmail);
  $('#api-key-form').addEventListener('submit', handleSaveApiKey);
  checkApiKeyStatus();
}

function renderAccountSecurityTab() {
  const container = $('#account-tab-content');
  container.innerHTML = html`
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
      <h2 class="card-title" style="margin-bottom:20px">Passkeys</h2>
      <p style="color:var(--text-secondary);font-size:0.85rem;line-height:1.6;margin-bottom:16px">
        Passkeys let you sign in without a password using your device's built-in authentication
        (fingerprint, face recognition, or PIN).
      </p>
      <div id="passkey-section-content">
        <div id="passkey-list" style="margin-bottom:16px">
          <p style="color:var(--text-muted);font-size:0.85rem">Loading...</p>
        </div>
        <button class="btn btn-primary btn-full" id="register-passkey-btn">
          <i data-lucide="fingerprint" style="width:16px;height:16px"></i>
          Register a New Passkey
        </button>
        <div id="passkey-status" style="margin-top:8px;font-size:0.82rem;color:var(--text-muted)"></div>
      </div>
    </div>
  `;

  $('#change-password-form').addEventListener('submit', handleChangePassword);
  $('#register-passkey-btn').addEventListener('click', handleRegisterPasskey);
  loadPasskeys();
}

function renderAccountLogsTab() {
  const container = $('#account-tab-content');
  container.innerHTML = html`
    <div class="card" style="margin-bottom:20px">
      <div id="log-list">
        <div style="text-align:center;padding:24px;color:var(--text-secondary)"><span class="spinner"></span> Loading...</div>
      </div>
    </div>
  `;
  fetchAccountLogs();
}

async function fetchAccountLogs(pageNum) {
  pageNum = pageNum || 1;
  const limit = 50;
  const offset = (pageNum - 1) * limit;
  const list = $('#log-list');
  if (!list) return;

  try {
    const data = await api(`/activity?limit=${limit}&offset=${offset}`);

    if (data.activities.length === 0) {
      list.innerHTML = '<div class="activity-empty">No activity found.</div>';
      return;
    }

    const pageInfo = data.totalPages > 1 ? html`
      <div class="log-pagination">
        <button class="btn btn-ghost btn-sm" onclick="fetchAccountLogs(${pageNum - 1})" ${pageNum <= 1 ? 'disabled' : ''}>Previous</button>
        <span class="log-pagination-info">Page ${data.page} of ${data.totalPages} (${data.total} total)</span>
        <button class="btn btn-ghost btn-sm" onclick="fetchAccountLogs(${pageNum + 1})" ${pageNum >= data.totalPages ? 'disabled' : ''}>Next</button>
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
    if (list) list.innerHTML = '<div class="activity-empty">Could not load activity log.</div>';
  }
}

function renderAccountDangerousTab() {
  const container = $('#account-tab-content');
  container.innerHTML = html`
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
  `;

  $('#delete-account-btn').addEventListener('click', handleDeleteAccountClick);
  $('#export-data-btn').addEventListener('click', handleExportData);
  initIcons();
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

async function loadPasskeys() {
  try {
    const data = await api('/auth/passkeys');
    const list = $('#passkey-list');
    if (!list) return;
    if (!data.passkeys.length) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No passkeys registered yet.</p>';
      return;
    }
    list.innerHTML = data.passkeys.map(p => html`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg-secondary);border-radius:var(--radius-sm);margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <i data-lucide="fingerprint" style="width:18px;height:18px;color:var(--accent-1)"></i>
          <div>
            <div style="font-size:0.9rem;font-weight:500">${p.name || 'Passkey'}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">${formatDate(p.created_at)}</div>
          </div>
        </div>
        <button class="btn btn-danger btn-sm" data-passkey-id="${p.id}" style="width:auto;padding:6px 12px;font-size:0.8rem">Delete</button>
      </div>
    `).join('');
    list.querySelectorAll('[data-passkey-id]').forEach(btn => {
      btn.addEventListener('click', () => handleDeletePasskey(btn.dataset.passkeyId));
    });
    initIcons();
  } catch (err) {
    const list = $('#passkey-list');
    if (list) list.innerHTML = `<p style="color:var(--accent-red);font-size:0.85rem">Failed to load passkeys: ${err.message}</p>`;
  }
}

async function handleRegisterPasskey() {
  const btn = $('#register-passkey-btn');
  const status = $('#passkey-status');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  status.textContent = '';

  try {
    const beginData = await api('/auth/passkeys/register/begin', {
      method: 'POST',
    });

    const credential = await navigator.credentials.create({
      publicKey: prepareWebAuthnOptions(beginData.options),
    });

    await api('/auth/passkeys/register/complete', {
      method: 'POST',
      body: JSON.stringify({ response: serializeCredential(credential) }),
    });

    showModal('Passkey registered', 'Your new passkey has been registered successfully. You can now use it to sign in.', 'Got it');
    loadPasskeys();
  } catch (err) {
    status.textContent = err.message;
    status.style.color = 'var(--accent-red)';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="fingerprint" style="width:16px;height:16px"></i> Register a New Passkey';
    initIcons();
  }
}

async function handleDeletePasskey(id) {
  const overlay = $('#modal-overlay');
  const content = $('#modal-content');
  content.innerHTML = html`
    <div class="modal-title">Delete Passkey</div>
    <p style="color:var(--text-secondary);line-height:1.6;margin-bottom:16px">
      Are you sure you want to delete this passkey? You will no longer be able to use it to sign in.
    </p>
    <div class="modal-actions">
      <button class="btn btn-ghost btn-full modal-cancel-btn">Cancel</button>
      <button class="btn btn-danger btn-full" id="confirm-delete-passkey-btn">Delete</button>
    </div>
  `;
  overlay.classList.add('open');

  const confirmBtn = $('#confirm-delete-passkey-btn');
  const newBtn = confirmBtn.cloneNode(true);
  confirmBtn.replaceWith(newBtn);
  newBtn.addEventListener('click', async () => {
    overlay.classList.remove('open');
    try {
      await api(`/auth/passkeys/${id}`, { method: 'DELETE' });
      showToast('Passkey deleted', 'info');
      loadPasskeys();
    } catch (err) {
      const status = $('#passkey-status');
      if (status) {
        status.textContent = err.message;
        status.style.color = 'var(--accent-red)';
      }
    }
  });
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
    await api('/auth/change-email', {
      method: 'POST',
      body: JSON.stringify({ newEmail, password }),
    });
    $('#acc-new-email').value = '';
    $('#acc-email-pw').value = '';
    showModal('Check your email', 'A confirmation link has been sent to your current email address. Click the link to proceed with the email change. The link expires in 30 minutes.', 'Got it');
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
              <button class="btn btn-danger btn-full" style="flex:1" onclick="sendPowerCommand('${s.identifier}','stop',event)" ${s.currentState !== 'running' ? 'disabled' : ''}>Stop</button>
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

// ===== ONBOARDING TOUR =====
const ONBOARDING_STEPS = [
  {
    title: 'Welcome to ZeroHost!',
    description: 'Would you like a quick tour of your dashboard? It only takes a minute.',
    highlight: null,
    buttons: ['Skip', 'Start'],
  },
  {
    title: 'Dashboard Overview',
    description: `This is your Dashboard — the central hub. Here you get an overview of all your servers, their status, and resource usage at a glance.`,
    highlight: '#sidebar-nav a.nav-item[data-page="overview"]',
    buttons: ['Skip', 'Next'],
  },
  {
    title: 'Create a Server',
    description: 'Use this button to deploy a new server. You can choose from different game types and configurations.',
    highlight: '#sidebar-nav a.nav-item[data-page="create"]',
    buttons: ['Skip', 'Next'],
  },
  {
    title: 'My Servers',
    description: 'All your servers live here. Manage them, check their status, rename them, and more.',
    highlight: '#nav-servers-toggle',
    buttons: ['Skip', 'Next'],
  },
  {
    title: 'Two things to remember',
    description: `<strong>Dashboard</strong> — Where you create servers, change names, view status, and manage your account.<br><br><strong>Hydrodactyl Panel</strong> — Where you start/stop your server, manage files, use the console, and control everything.`,
    highlight: null,
    buttons: ['Skip', 'Got it!'],
  },
];

let onboardingActive = false;
let onboardingStep = 0;
let onboardingHighlightEl = null;

function clearOnboardingHighlight() {
  const spotlight = $('#onboarding-spotlight');
  if (spotlight) spotlight.style.display = 'none';
  const el = $('#onboarding-highlight-el');
  if (el) el.removeAttribute('id');
  onboardingHighlightEl = null;
}

function applyOnboardingHighlight(selector) {
  clearOnboardingHighlight();
  if (!selector) return;

  const el = document.querySelector(selector);
  if (!el) return;

  const rect = el.getBoundingClientRect();

  let spotlight = $('#onboarding-spotlight');
  if (!spotlight) {
    spotlight = document.createElement('div');
    spotlight.id = 'onboarding-spotlight';
    spotlight.className = 'onboarding-spotlight';
    const overlay = $('#onboarding-overlay');
    if (overlay) overlay.appendChild(spotlight);
  }

  spotlight.style.left = rect.left + 'px';
  spotlight.style.top = rect.top + 'px';
  spotlight.style.width = rect.width + 'px';
  spotlight.style.height = rect.height + 'px';
  spotlight.style.display = 'block';

  onboardingHighlightEl = spotlight;
}

function positionOnboardingCard(selector) {
  const card = $('#onboarding-card');
  if (!card) return;

  // Remove old arrow
  const oldArrow = card.querySelector('.card-arrow');
  if (oldArrow) oldArrow.remove();

  if (!selector) {
    card.classList.add('centered');
    card.style.top = '';
    card.style.left = '';
    card.style.transform = '';
    return;
  }

  card.classList.remove('centered');

  const el = document.querySelector(selector);
  if (!el) return;

  const elRect = el.getBoundingClientRect();
  const cardW = 440;
  const cardMaxH = window.innerHeight - 80;
  const gap = 14;

  let top, left, arrowDir;
  const approxCardH = Math.min(360, cardMaxH);

  // Try right first (sidebar items are on the left)
  const spaceRight = window.innerWidth - elRect.right;
  if (spaceRight >= cardW + gap + 30) {
    left = elRect.right + gap;
    top = elRect.top + elRect.height / 2 - approxCardH / 2;
    arrowDir = 'left';
  } else {
    // Try below
    const spaceBelow = window.innerHeight - elRect.bottom;
    const spaceAbove = elRect.top;
    if (spaceBelow >= approxCardH + gap + 20) {
      top = elRect.bottom + gap;
      left = elRect.left + elRect.width / 2 - cardW / 2;
      arrowDir = 'up';
    } else if (spaceAbove >= approxCardH + gap + 20) {
      top = elRect.top - gap - approxCardH;
      left = elRect.left + elRect.width / 2 - cardW / 2;
      arrowDir = 'down';
    } else {
      // Center as fallback
      top = Math.max(20, (window.innerHeight - approxCardH) / 2);
      left = Math.max(16, (window.innerWidth - cardW) / 2);
      arrowDir = null;
    }
  }

  // Clamp to viewport
  left = Math.max(16, Math.min(left, window.innerWidth - cardW - 16));
  top = Math.max(16, Math.min(top, window.innerHeight - approxCardH - 16));

  card.style.top = top + 'px';
  card.style.left = left + 'px';
  card.style.transform = 'none';

  if (arrowDir) {
    const arrow = document.createElement('div');
    arrow.className = 'card-arrow';
    arrow.dataset.dir = arrowDir;
    card.appendChild(arrow);

    if (arrowDir === 'left') {
      arrow.style.left = (left - 10) + 'px';
      arrow.style.top = (elRect.top + elRect.height / 2) + 'px';
    } else if (arrowDir === 'up') {
      arrow.style.left = (elRect.left + elRect.width / 2) + 'px';
      arrow.style.top = (top - 10) + 'px';
    } else if (arrowDir === 'down') {
      arrow.style.left = (elRect.left + elRect.width / 2) + 'px';
      arrow.style.top = (top + approxCardH) + 'px';
    }
  }
}

function renderOnboardingStep(stepIndex) {
  const card = $('#onboarding-card');
  if (!card) return;

  const step = ONBOARDING_STEPS[stepIndex];

  let dotsHtml = '<div class="onboarding-dots">';
  ONBOARDING_STEPS.forEach((_, i) => {
    dotsHtml += `<span class="onboarding-dot ${i === stepIndex ? 'active' : ''}"></span>`;
  });
  dotsHtml += '</div>';

  const leftBtn = step.buttons[0];
  const rightBtn = step.buttons[1];

  card.innerHTML = html`
    ${dotsHtml}
    <h2>${escapeHtml(step.title)}</h2>
    <p>${step.description}</p>
    <div class="onboarding-actions">
      <button class="btn btn-ghost" id="onboarding-skip">${leftBtn}</button>
      <button class="btn btn-primary" id="onboarding-next">${rightBtn}</button>
    </div>
  `;

  const backdrop = $('#onboarding-backdrop');
  if (step.highlight) {
    if (backdrop) backdrop.style.display = 'none';
    applyOnboardingHighlight(step.highlight);
  } else {
    if (backdrop) backdrop.style.display = 'block';
    clearOnboardingHighlight();
  }

  positionOnboardingCard(step.highlight);
  initIcons();
}

async function startOnboarding() {
  if (onboardingActive) return;
  onboardingActive = true;
  onboardingStep = 0;

  const existing = $('#onboarding-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = html`
    <div class="onboarding-backdrop" id="onboarding-backdrop" style="display:none"></div>
    <div class="onboarding-card centered" id="onboarding-card"></div>
  `;
  document.body.appendChild(overlay);

  renderOnboardingStep(0);

  const attachListeners = () => {
    $('#onboarding-skip').addEventListener('click', stopOnboarding);
    $('#onboarding-next').addEventListener('click', () => {
      if (onboardingStep === 0) {
        onboardingStep = 1;
        renderOnboardingStep(onboardingStep);
        attachListeners();
      } else {
        handleOnboardingNext();
      }
    });
  };
  attachListeners();
}

function handleOnboardingNext() {
  if (onboardingStep < ONBOARDING_STEPS.length - 1) {
    onboardingStep++;
    renderOnboardingStep(onboardingStep);
    $('#onboarding-skip').addEventListener('click', stopOnboarding);
    $('#onboarding-next').addEventListener('click', handleOnboardingNext);
  } else if (onboardingStep === ONBOARDING_STEPS.length - 1) {
    stopOnboarding(true);
  }
}

async function stopOnboarding(done) {
  if (!onboardingActive) return;
  onboardingActive = false;
  clearOnboardingHighlight();
  const overlay = $('#onboarding-overlay');
  if (overlay) overlay.remove();

  if (done && state.token) {
    try {
      await api('/auth/complete-onboarding', { method: 'POST' });
    } catch {}
  }
}

async function checkAndStartOnboarding() {
  if (!state.token) return;
  try {
    const data = await api('/auth/onboarding-status');
    if (!data.done) {
      startOnboarding();
    }
  } catch {}
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

  if (basePage === 'verify-email') {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    renderVerifyEmail(token);
    return;
  }

  if (basePage === 'change-email') {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    renderChangeEmailVerify(token);
    return;
  }

  if (basePage === 'login' || basePage === 'signup') {
    if (state.token) {
      history.replaceState({ page: 'overview' }, '', '/');
      renderDashboard();
      if (basePage !== 'signup') checkAndStartOnboarding();
    } else if (basePage === 'login') {
      renderLoginPage();
    } else {
      renderRegisterPage();
    }
  } else if (state.token) {
    api('/servers/overview').then(() => {
      renderDashboard();
      checkAndStartOnboarding();
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

