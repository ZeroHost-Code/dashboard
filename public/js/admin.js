function initIcons() { if (window.lucide) lucide.createIcons(); }

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
  return str.replace(/[&<>"']/g, m => map[m]);
}

const ADMIN_STORAGE_KEY = 'zh_admin_token';

const adminState = {
  token: localStorage.getItem(ADMIN_STORAGE_KEY),
  user: null,
  currentPage: 'servers',
  serverId: null,
  userId: null,
};

function ahtml(strings, ...values) {
  return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
}

// ─── Simple Icons Library (loaded dynamically) ────────────
let _simpleIconsCache = null;
let _simpleIconsLoading = null;

async function loadSimpleIcons() {
  if (_simpleIconsCache) return _simpleIconsCache;
  if (_simpleIconsLoading) return _simpleIconsLoading;

  _simpleIconsLoading = (async () => {
    try {
      const res = await fetch('https://cdn.jsdelivr.net/gh/simple-icons/simple-icons@develop/slugs.md');
      const text = await res.text();
      const icons = [];
      const re = /\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const label = m[1];
        const slug = m[2];
        if (slug && label) icons.push({ slug, label });
      }
      icons.sort((a, b) => a.label.localeCompare(b.label));
      _simpleIconsCache = icons;
    } catch (e) {
      console.warn('Failed to load Simple Icons list, using fallback');
      _simpleIconsCache = [
        { slug: 'docker', label: 'Docker' },
        { slug: 'kubernetes', label: 'Kubernetes' },
        { slug: 'minecraft', label: 'Minecraft' },
        { slug: 'ubuntu', label: 'Ubuntu' },
        { slug: 'debian', label: 'Debian' },
        { slug: 'linux', label: 'Linux' },
        { slug: 'github', label: 'GitHub' },
        { slug: 'discord', label: 'Discord' },
        { slug: 'database', label: 'Database' },
        { slug: 'code', label: 'Code' },
      ];
    }
    _simpleIconsLoading = null;
    return _simpleIconsCache;
  })();

  return _simpleIconsLoading;
}

// ─── Lucide Icons (dynamically loaded from lucide.icons) ─
function getLucideIcons() {
  if (typeof lucide === 'undefined' || !lucide.icons) return [];
  return Object.keys(lucide.icons).sort().map(name => ({
    name,
    label: name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }));
}

function lucideIconHtml(name, size, extraStyle) {
  const s = size || 32;
  const style = `width:${s}px;height:${s}px;${extraStyle || ''}`;
  return `<i data-lucide="${name}" style="${style}"></i>`;
}

function renderLucidePickerGrid(selectedName) {
  return `<div style="text-align:center;padding:16px;color:var(--text-secondary)"><span class="spinner"></span> Loading icons...</div>`;
}

async function renderLucidePickerGridLoaded(selectedName) {
  const icons = getLucideIcons();
  if (!icons.length) return '<div style="text-align:center;padding:16px;color:var(--text-secondary)">Lucide not loaded</div>';
  return icons.map(icon => {
    const isSelected = icon.name === selectedName;
    return `<div class="svg-picker-item ${isSelected ? 'selected' : ''}" data-name="${icon.name}" data-label="${escapeHtml(icon.label)}" title="${escapeHtml(icon.label)}">
      <i data-lucide="${icon.name}" style="width:24px;height:24px"></i>
      <span>${escapeHtml(icon.label)}</span>
    </div>`;
  }).join('');
}

function siUrl(slug) {
  return `https://cdn.simpleicons.org/${slug}`;
}

function renderLogoDisplay(logo, size, extraStyle) {
  if (!logo) return '';
  const s = size || 32;
  const style = `width:${s}px;height:${s}px;object-fit:contain;border-radius:4px;${extraStyle || ''}`;
  if (logo.startsWith('si:')) {
    const slug = logo.slice(3);
    return `<img src="${siUrl(slug)}" alt="" style="${style}" />`;
  }
  if (logo.startsWith('lucide:')) {
    const name = logo.slice(7);
    return lucideIconHtml(name, s, extraStyle);
  }
  return `<img src="${escapeHtml(logo)}" alt="" style="${style}" />`;
}

function renderSvgPickerGrid(selectedSlug) {
  return `<div style="text-align:center;padding:16px;color:var(--text-secondary)"><span class="spinner"></span> Loading icons...</div>`;
}

async function renderSvgPickerGridLoaded(selectedSlug) {
  const icons = await loadSimpleIcons();
  return icons.map(icon => {
    const isSelected = icon.slug === selectedSlug;
    return `<div class="svg-picker-item ${isSelected ? 'selected' : ''}" data-slug="${icon.slug}" data-label="${escapeHtml(icon.label)}" title="${escapeHtml(icon.label)}">
      <img src="${siUrl(icon.slug)}" alt="${escapeHtml(icon.label)}" loading="lazy" />
      <span>${escapeHtml(icon.label)}</span>
    </div>`;
  }).join('');
}

function initSvgPickerListeners(container, onSelect) {
  if (!container) return;
  const search = container.querySelector('.svg-picker-search');
  const grid = container.querySelector('.svg-picker-grid');
  if (!search || !grid) return;

  search.addEventListener('input', () => {
    const q = search.value.toLowerCase().trim();
    grid.querySelectorAll('.svg-picker-item').forEach(item => {
      const label = (item.dataset.label || '').toLowerCase();
      const slug = (item.dataset.slug || item.dataset.name || '').toLowerCase();
      item.style.display = (!q || label.includes(q) || slug.includes(q)) ? '' : 'none';
    });
  });

  grid.addEventListener('click', (e) => {
    const item = e.target.closest('.svg-picker-item');
    if (!item) return;
    grid.querySelectorAll('.svg-picker-item').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');
    onSelect(item.dataset.name || item.dataset.slug);
  });
}

async function adminApi(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (adminState.token) {
    headers['Authorization'] = `Bearer ${adminState.token}`;
  }
  let res;
  try {
    res = await fetch(`/api/admin${path}`, { ...options, headers });
  } catch {
    throw new Error('Unable to reach the server.');
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Server error.');
  }
  if (!res.ok) {
    if (res.status === 403) {
      adminState.token = null;
      adminState.user = null;
      localStorage.removeItem(ADMIN_STORAGE_KEY);
      renderAdminLogin();
    }
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function $a(sel) { return document.querySelector(sel); }

function adminNavigateTo(page) {
  const parts = page.split('/');
  const basePage = parts[0] || 'servers';
  const param = parts[1];

  if (basePage === 'login') {
    renderAdminLogin();
    history.pushState({ adminPage: 'login' }, '', '/admin');
    return;
  }

  if (!adminState.token) {
    renderAdminLogin();
    history.pushState({ adminPage: 'login' }, '', '/admin');
    return;
  }

  adminState.currentPage = basePage;
  adminState.serverId = param ? parseInt(param, 10) : null;
  adminState.userId = param ? parseInt(param, 10) : null;
  adminState.nodeId = param ? parseInt(param, 10) : null;
  updateAdminNav();

  if (basePage === 'server' && adminState.serverId) {
    renderAdminServerDetail(adminState.serverId);
    history.pushState({ adminPage: 'server', serverId: adminState.serverId }, '', `/admin/server/${adminState.serverId}`);
  } else if (basePage === 'user' && adminState.userId) {
    renderAdminUserDetail(adminState.userId);
    history.pushState({ adminPage: 'user', userId: adminState.userId }, '', `/admin/user/${adminState.userId}`);
  } else if (basePage === 'node' && adminState.nodeId) {
    renderAdminNodeDetail(adminState.nodeId);
    history.pushState({ adminPage: 'node', nodeId: adminState.nodeId }, '', `/admin/node/${adminState.nodeId}`);
  } else if (basePage === 'nodes') {
    renderAdminNodes();
    history.pushState({ adminPage: 'nodes' }, '', '/admin/nodes');
  } else if (basePage === 'users') {
    renderAdminUsers();
    history.pushState({ adminPage: 'users' }, '', '/admin/users');
  } else if (basePage === 'dashboard') {
    renderAdminDashboard();
    history.pushState({ adminPage: 'dashboard' }, '', '/admin/dashboard');
  } else if (basePage === 'settings') {
    const sub = parts[1];
    if (sub === 'eggs') {
      const nestId = parts[2] ? parseInt(parts[2], 10) : null;
      const eggId = parts[3] ? parseInt(parts[3], 10) : null;
      if (nestId && eggId) {
        renderAdminEggSettings(nestId, eggId);
        history.pushState({ adminPage: 'settings', sub: 'eggs', nestId, eggId }, '', `/admin/settings/eggs/${nestId}/${eggId}`);
      } else if (nestId) {
        renderAdminNestEggs(nestId);
        history.pushState({ adminPage: 'settings', sub: 'eggs', nestId }, '', `/admin/settings/eggs/${nestId}`);
      } else {
        renderAdminEggsSettings();
        history.pushState({ adminPage: 'settings', sub: 'eggs' }, '', '/admin/settings/eggs');
      }
    } else {
      renderAdminSettings();
      history.pushState({ adminPage: 'settings' }, '', '/admin/settings');
    }
  } else {
    renderAdminServers();
    history.pushState({ adminPage: 'servers' }, '', '/admin/servers');
  }
}

function renderAdminLogin() {
  const app = $a('#app');
  if (!app) return;
  app.innerHTML = ahtml`
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
          <span class="auth-logo-text">Zero<span class="auth-logo-accent">Host</span> <span style="font-size:0.7rem;color:var(--accent-1);font-weight:600;margin-left:4px;border:1px solid var(--accent-1);padding:2px 8px;border-radius:4px">Admin</span></span>
        </div>
        <h1 class="auth-title">Admin Panel</h1>
        <p class="auth-subtitle">Sign in with admin credentials</p>
        <form id="admin-login-form">
          <div class="auth-error"></div>
          <div class="form-group">
            <label for="admin-email">Email</label>
            <input type="email" id="admin-email" placeholder="admin@email.com" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label for="admin-password">Password</label>
            <input type="password" id="admin-password" placeholder="••••••••" required autocomplete="current-password" />
          </div>
          <div style="width:100%;margin-bottom:16px">
            <cap-widget data-cap-api-endpoint="https://cap.zero-host.org/f6c8171b08/" theme="dark"></cap-widget>
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="admin-login-btn">Sign In</button>
        </form>
        <div class="auth-footer">
          <a href="/" id="admin-back-dashboard">Back to Dashboard</a>
        </div>
      </div>
    </div>
  `;

  $a('#admin-login-form').addEventListener('submit', handleAdminLogin);
  $a('#admin-back-dashboard').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '/';
  });
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const btn = $a('#admin-login-btn');
  const errorEl = $a('#admin-login-form .auth-error');
  if (errorEl) errorEl.classList.remove('show');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in...';

  try {
      const capWidget = $a('#admin-login-form cap-widget');
      const capToken = capWidget?.token || '';
      const data = await adminApi('/login', {
        method: 'POST',
        body: JSON.stringify({
          email: $a('#admin-email').value,
          password: $a('#admin-password').value,
          capToken,
        }),
      });
    adminState.token = data.token;
    adminState.user = data.user;
    localStorage.setItem(ADMIN_STORAGE_KEY, data.token);
    history.replaceState({ adminPage: 'dashboard' }, '', '/admin/dashboard');
    renderAdminLayout();
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.classList.add('show');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
}

function renderAdminLayout() {
  const app = $a('#app');
  if (!app) return;
  app.innerHTML = ahtml`
    <div class="admin-layout">
      <nav class="admin-navbar">
        <div class="admin-navbar-left">
          <a href="/" class="sidebar-logo" style="text-decoration:none">
            <img src="https://img.zero-host.org/assets/picto.png" alt="ZeroHost" />
            <span class="sidebar-logo-text">Zero<span style="color:var(--accent-3)">Host</span></span>
          </a>
          <span class="admin-badge">Admin</span>
        </div>
        <div class="admin-navbar-center">
          <a class="admin-nav-link" data-page="dashboard" href="/admin/dashboard">
            <i data-lucide="grid-3x3" style="width:18px;height:18px"></i>
            Dashboard
          </a>
          <a class="admin-nav-link" data-page="servers" href="/admin/servers">
            <i data-lucide="server" style="width:18px;height:18px"></i>
            Servers
          </a>
          <a class="admin-nav-link" data-page="nodes" href="/admin/nodes">
            <i data-lucide="network" style="width:18px;height:18px"></i>
            Nodes
          </a>
          <a class="admin-nav-link" data-page="users" href="/admin/users">
            <i data-lucide="users" style="width:18px;height:18px"></i>
            Users
          </a>
          <a class="admin-nav-link" data-page="settings" href="/admin/settings">
            <i data-lucide="settings" style="width:18px;height:18px"></i>
            Settings
          </a>
        </div>
        <div class="admin-navbar-right">
          <span class="admin-navbar-user">${adminState.user?.username || 'Admin'}</span>
          <button class="btn btn-ghost btn-sm" id="admin-logout-btn" style="width:auto">Logout</button>
        </div>
      </nav>
      <main class="admin-content">
        <div class="admin-modal-overlay" id="admin-modal-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:1000;align-items:center;justify-content:center" onclick="if(event.target===this)closeAdminModal()">
          <div class="admin-modal" style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.4)" onclick="event.stopPropagation()" id="admin-modal-content"></div>
        </div>
        <div class="admin-page" id="admin-page-dashboard"></div>
        <div class="admin-page active" id="admin-page-servers"></div>
        <div class="admin-page" id="admin-page-server-detail"></div>
        <div class="admin-page" id="admin-page-nodes"></div>
        <div class="admin-page" id="admin-page-node-detail"></div>
        <div class="admin-page" id="admin-page-users"></div>
        <div class="admin-page" id="admin-page-user-detail"></div>
        <div class="admin-page" id="admin-page-settings"></div>
      </main>
      <div id="admin-date-tooltip"></div>
    </div>
  `;

  $a('#admin-logout-btn').addEventListener('click', async () => {
    adminState.token = null;
    adminState.user = null;
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    adminNavigateTo('login');
  });

  document.querySelectorAll('.admin-nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      if (page === 'activity') {
        window.location.href = '/logs';
        return;
      }
      adminNavigateTo(page);
    });
  });

  initAdminDateTooltip();
  initIcons();

  const path = window.location.pathname.replace('/admin/', '').split('/');
  const basePage = path[0] || 'dashboard';
  const param = path[1] || null;
  if (basePage === 'server' && param) {
    const pid = parseInt(param, 10);
    adminState.currentPage = 'server';
    updateAdminNav();
    adminState.serverId = pid;
    $a('#admin-page-server-detail').classList.add('active');
    $a('#admin-page-servers').classList.remove('active');
    renderAdminServerDetail(pid);
  } else if (basePage === 'user' && param) {
    const uid = parseInt(param, 10);
    adminState.currentPage = 'user';
    updateAdminNav();
    adminState.userId = uid;
    $a('#admin-page-user-detail').classList.add('active');
    renderAdminUserDetail(uid);
  } else if (basePage === 'node' && param) {
    const nid = parseInt(param, 10);
    adminState.currentPage = 'node';
    updateAdminNav();
    adminState.nodeId = nid;
    $a('#admin-page-node-detail').classList.add('active');
    renderAdminNodeDetail(nid);
  } else if (basePage === 'nodes') {
    adminState.currentPage = 'nodes';
    updateAdminNav();
    renderAdminNodes();
  } else if (basePage === 'users') {
    adminState.currentPage = 'users';
    updateAdminNav();
    renderAdminUsers();
  } else if (basePage === 'dashboard' || !basePage) {
    adminState.currentPage = 'dashboard';
    updateAdminNav();
    renderAdminDashboard();
  } else if (basePage === 'settings') {
    adminState.currentPage = 'settings';
    adminState.settingsNestId = null;
    adminState.settingsEggId = null;
    updateAdminNav();
    $a('#admin-page-settings').classList.add('active');
    const sub = path[1];
    if (sub === 'eggs') {
      const nestId = path[2] ? parseInt(path[2], 10) : null;
      const eggId = path[3] ? parseInt(path[3], 10) : null;
      if (nestId && eggId) renderAdminEggSettings(nestId, eggId);
      else if (nestId) renderAdminNestEggs(nestId);
      else renderAdminEggsSettings();
    } else {
      renderAdminSettings();
    }
  } else {
    adminState.currentPage = 'servers';
    updateAdminNav();
    renderAdminServers();
  }
}

function initAdminDateTooltip() {
  const tooltip = document.getElementById('admin-date-tooltip');
  if (!tooltip) return;
  let timer = null;
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('.date-tooltip');
    if (!target) return;
    const full = target.getAttribute('data-full');
    if (!full) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const rect = target.getBoundingClientRect();
      tooltip.textContent = full;
      tooltip.style.top = (rect.top - 8) + 'px';
      tooltip.style.left = (rect.left + rect.width / 2) + 'px';
      tooltip.style.transform = 'translate(-50%, -100%)';
      tooltip.classList.add('visible');
    }, 1000);
  });
  document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('.date-tooltip');
    if (!target) return;
    clearTimeout(timer);
    tooltip.classList.remove('visible');
  });
}

function updateAdminNav() {
  document.querySelectorAll('.admin-nav-link').forEach(link => {
    const page = link.dataset.page;
    link.classList.toggle('active', adminState.currentPage === page);
  });
}

let adminServersPage = 1;

async function renderAdminServers() {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  const el = $a('#admin-page-servers');
  if (!el) return;
  el.classList.add('active');
  el.innerHTML = ahtml`
    <div class="page-header">
      <h1 class="page-title">All Servers</h1>
      <p class="page-subtitle">All servers across all users</p>
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Owner</th>
            <th>Egg</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="admin-servers-tbody">
          <tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-secondary)"><span class="spinner"></span> Loading...</td></tr>
        </tbody>
      </table>
      <div id="admin-servers-pagination" style="display:none"></div>
    </div>
  `;

  await fetchAdminServers(adminServersPage);
}

async function fetchAdminServers(pageNum) {
  pageNum = pageNum || 1;
  const limit = 10;
  const offset = (pageNum - 1) * limit;
  const paginationEl = $a('#admin-servers-pagination');

  try {
    const data = await adminApi(`/servers?limit=${limit}&offset=${offset}`);
    const tbody = $a('#admin-servers-tbody');
    if (!tbody) return;

    if (data.servers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-secondary)">No servers found.</td></tr>';
      if (paginationEl) paginationEl.style.display = 'none';
      return;
    }

    tbody.innerHTML = data.servers.map(s => {
      const eggName = s.eggDetails?.name || `Egg #${s.egg}`;
      const isInstalling = s.status === 'installing' || s.installed === 0 || s.installed === '0' || s.installed === false;
      const isSuspended = s.status === 'suspended';
      const statusClass = isSuspended ? 'status-suspended' : (isInstalling ? 'status-installing' : 'status-active');
      const statusLabel = isSuspended ? 'Suspended' : (isInstalling ? 'Installing' : 'Active');
      const ownerName = s.owner?.username || 'Unknown';

      return ahtml`
        <tr>
          <td data-label="Name"><strong>${escapeHtml(s.name)}</strong></td>
          <td data-label="Owner">${escapeHtml(ownerName)}</td>
          <td data-label="Egg"><span class="server-detail-tag">${escapeHtml(eggName)}</span></td>
          <td data-label="Status"><span class="server-card-status ${statusClass}">${escapeHtml(statusLabel)}</span></td>
          <td data-label="Actions">
            <div style="display:flex;gap:8px;align-items:center">
              <a class="btn btn-ghost btn-sm" href="/admin/server/${s.id}" onclick="event.preventDefault();adminNavigateTo('server/${s.id}')">Details</a>
              <a class="btn btn-ghost btn-sm" href="${PTERO_URL}/server/${s.identifier}" target="_blank">Open Hydrodactyl</a>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    if (data.totalPages > 1) {
      paginationEl.innerHTML = ahtml`
        <div class="log-pagination">
          <button class="btn btn-ghost btn-sm" onclick="changeAdminServersPage(${pageNum - 1})" ${pageNum <= 1 ? 'disabled' : ''}>Previous</button>
          <span class="log-pagination-info">Page ${data.page} of ${data.totalPages} (${data.total} total)</span>
          <button class="btn btn-ghost btn-sm" onclick="changeAdminServersPage(${pageNum + 1})" ${pageNum >= data.totalPages ? 'disabled' : ''}>Next</button>
        </div>
      `;
      paginationEl.style.display = '';
    } else {
      paginationEl.style.display = 'none';
    }
  } catch (err) {
    const tbody = $a('#admin-servers-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--accent-red)">Error: ${err.message}</td></tr>`;
  }
  initIcons();
}

function changeAdminServersPage(pageNum) {
  adminServersPage = pageNum;
  fetchAdminServers(pageNum);
}

async function renderAdminServerDetail(serverId) {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  const detailPage = $a('#admin-page-server-detail');
  if (!detailPage) return;
  detailPage.classList.add('active');

  detailPage.innerHTML = ahtml`
    <div style="text-align:center;padding:32px;color:var(--text-secondary)"><span class="spinner"></span> Loading server details...</div>
  `;

  try {
    const data = await adminApi(`/servers/${serverId}`);
    const s = data.server;
    const meta = s.serverMeta;
    const eggName = s.eggDetails?.name || `Egg #${s.egg}`;
    const alloc = s.allocationDetails;
    const allocStr = alloc ? `${alloc.alias || alloc.nodeFqdn || alloc.ip}:${alloc.port}` : (s.nodeFqdn || `Node #${s.node}`);
    const isInstalling = s.status === 'installing' || s.installed === 0 || s.installed === '0' || s.installed === false;
    const isSuspended = s.status === 'suspended';
    const statusClass = isSuspended ? 'status-suspended' : (isInstalling ? 'status-installing' : 'status-active');
    const statusLabel = isSuspended ? 'Suspended' : (isInstalling ? 'Installing' : 'Active');

    detailPage.innerHTML = ahtml`
      <div class="page-header">
        <a href="/admin/servers" onclick="event.preventDefault();adminNavigateTo('servers')" class="btn btn-ghost btn-sm" style="display:inline-flex;width:auto;margin-bottom:16px">
          <i data-lucide="arrow-left" style="width:14px;height:14px"></i>
          Back to Servers
        </a>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <h1 class="page-title" style="margin-bottom:0">${escapeHtml(s.name)}</h1>
          <span class="server-card-status ${statusClass}" style="font-size:0.8rem">${statusLabel}</span>
        </div>
      </div>

      <div class="tabs" id="admin-server-tabs">
        <button class="tab active" data-tab="info">Info</button>
        <button class="tab" data-tab="admin">Admin</button>
        <div class="tab-indicator" id="admin-tab-indicator"></div>
      </div>

      <div id="admin-server-tab-info" class="tab-content" style="display:block">
        <div class="server-detail-grid">
          <div class="card">
            <h2 class="card-title" style="margin-bottom:16px">Server Info</h2>
            <div class="detail-list">
              <div class="detail-item"><span class="detail-label">Owner</span><span class="detail-value">${s.owner?.username || 'Unknown'} (${s.owner?.email || 'N/A'})</span></div>
              <div class="detail-item"><span class="detail-label">Egg</span><span class="detail-value">${escapeHtml(eggName)}</span></div>
              <div class="detail-item"><span class="detail-label">Allocation</span><span class="detail-value">${escapeHtml(allocStr)}</span></div>
              <div class="detail-item"><span class="detail-label">Identifier</span><span class="detail-value" style="font-family:monospace">${s.identifier}</span></div>
              <div class="detail-item"><span class="detail-label">Memory</span><span class="detail-value">${s.limits.memory > 0 ? s.limits.memory + ' MB' : '∞'}</span></div>
              <div class="detail-item"><span class="detail-label">CPU</span><span class="detail-value">${s.limits.cpu}%</span></div>
              <div class="detail-item"><span class="detail-label">Disk</span><span class="detail-value">${s.limits.disk > 0 ? (s.limits.disk / 1024).toFixed(1) + ' GB' : '∞'}</span></div>
              <div class="detail-item"><span class="detail-label">IO</span><span class="detail-value">${s.limits.io}</span></div>
              <div class="detail-item"><span class="detail-label">Swap</span><span class="detail-value">${s.limits.swap > 0 ? s.limits.swap + ' MB' : 'Disabled'}</span></div>
            </div>
          </div>
          ${meta ? ahtml`
            <div class="card">
              <h2 class="card-title" style="margin-bottom:16px">Lifetime</h2>
              <div class="detail-list">
                <div class="detail-item"><span class="detail-label">Created</span><span class="detail-value">${formatDateWithTooltip(meta.created_at)}</span></div>
                <div class="detail-item"><span class="detail-label">Expires</span><span class="detail-value">${formatDateWithTooltip(meta.expires_at)}</span></div>
                <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value" style="text-transform:capitalize">${meta.status}</span></div>
                ${meta.status === 'suspended' && meta.suspend_reason ? ahtml`
                  <div class="detail-item"><span class="detail-label">Reason</span><span class="detail-value" style="color:var(--accent-red)">${meta.suspend_reason}</span></div>
                ` : ''}
              </div>
            </div>
          ` : ''}
        </div>
      </div>

      <div id="admin-server-tab-admin" class="tab-content" style="display:none">
        <div class="server-detail-grid">
        <div class="card">
          <h2 class="card-title" style="margin-bottom:16px">Suspend</h2>
          <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:12px">
            Suspend or expire this server.
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${isSuspended ? ahtml`<button class="btn btn-primary" id="admin-btn-unsuspend" style="width:auto">Unsuspend</button>` : ahtml`<button class="btn btn-danger" id="admin-btn-suspend" style="width:auto">Suspend</button>`}
            <button class="btn btn-warning" id="admin-btn-stop" style="width:auto">Stop</button>
          </div>
          <div id="admin-action-msg" style="margin-top:12px;display:none"></div>
        </div>

        ${!isSuspended ? ahtml`
        <div class="card">
          <h2 class="card-title" style="margin-bottom:16px">Danger Zone</h2>
          <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:12px">
            Irreversible actions.
          </p>
          <button class="btn btn-danger" id="admin-btn-delete" style="width:auto">Delete Server</button>
        </div>
        ` : ''}
        </div>
      </div>
    `;

    initAdminTabs(serverId);
    initAdminActions(serverId);
    initIcons();
  } catch (err) {
    detailPage.innerHTML = ahtml`
      <div class="page-header">
        <a href="/admin/servers" onclick="event.preventDefault();adminNavigateTo('servers')" class="btn btn-ghost btn-sm" style="display:inline-flex;width:auto;margin-bottom:16px">Back to Servers</a>
      </div>
      <div class="empty-state">
        <div class="empty-state-title">Server not found</div>
        <div class="empty-state-desc">${err.message}</div>
      </div>
    `;
  }
}

function initAdminTabs(serverId) {
  const tabs = $a('#admin-server-tabs');
  if (!tabs) return;
  const indicator = $a('#admin-tab-indicator');
  const btns = tabs.querySelectorAll('.tab');

  function switchTab(tabBtn) {
    const tabName = tabBtn.dataset.tab;
    btns.forEach(t => t.classList.remove('active'));
    tabBtn.classList.add('active');

    document.querySelectorAll('#admin-page-server-detail .tab-content').forEach(c => c.style.display = 'none');
    const target = $a('#admin-server-tab-' + tabName);
    if (target) target.style.display = 'block';

    if (indicator) {
      indicator.style.left = tabBtn.offsetLeft + 'px';
      indicator.style.width = tabBtn.offsetWidth + 'px';
    }

    history.pushState({ adminPage: 'server', serverId, tab: tabName }, '', `/admin/server/${serverId}/${tabName}`);
  }

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      switchTab(btn);
    });
  });

  // Set initial indicator position
  const pathParts = window.location.pathname.replace('/admin/', '').split('/');
  const tabFromUrl = pathParts[2];
  if (tabFromUrl) {
    const tabBtn = Array.from(btns).find(b => b.dataset.tab === tabFromUrl);
    if (tabBtn) {
      switchTab(tabBtn);
      return;
    }
  }

  const activeBtn = tabs.querySelector('.tab.active');
  if (activeBtn && indicator) {
    indicator.style.left = activeBtn.offsetLeft + 'px';
    indicator.style.width = activeBtn.offsetWidth + 'px';
  }
}

function initAdminActions(serverId) {
  const msgEl = $a('#admin-action-msg');

  function showMsg(text, type = 'success') {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.display = 'block';
    msgEl.style.color = type === 'error' ? 'var(--accent-red)' : 'var(--accent-green)';
  }

  function clearMsg() {
    if (msgEl) msgEl.style.display = 'none';
  }

  $a('#admin-btn-suspend')?.addEventListener('click', () => {
    showSuspendModal(serverId);
  });

  $a('#admin-btn-unsuspend')?.addEventListener('click', async () => {
    const btn = $a('#admin-btn-unsuspend');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Unsuspending...';
    clearMsg();
    try {
      await adminApi(`/servers/${serverId}/unsuspend`, {
        method: 'POST',
      });
      showMsg('Server unsuspended successfully');
      setTimeout(() => renderAdminServerDetail(serverId), 1500);
    } catch (err) {
      showMsg(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Unsuspend';
    }
  });

  $a('#admin-btn-stop')?.addEventListener('click', async () => {
    const btn = $a('#admin-btn-stop');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Stopping...';
    clearMsg();
    try {
      await adminApi(`/servers/${serverId}/stop`, {
        method: 'POST',
      });
      showMsg('Server stopped successfully');
      btn.disabled = false;
      btn.innerHTML = 'Stop';
    } catch (err) {
      showMsg(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Stop';
    }
  });

  $a('#admin-btn-delete')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to permanently delete this server? This action cannot be undone.')) return;
    const btn = $a('#admin-btn-delete');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Deleting...';
    clearMsg();
    try {
      await adminApi(`/servers/${serverId}`, {
        method: 'DELETE',
      });
      showMsg('Server deleted');
      setTimeout(() => adminNavigateTo('servers'), 1500);
    } catch (err) {
      showMsg(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Delete Server';
    }
  });
}

// ─── Suspend Modal ─────────────────────────────────────
function closeAdminModal() {
  $a('#admin-modal-overlay').style.display = 'none';
}

function showSuspendModal(serverId) {
  const content = $a('#admin-modal-content');
  content.innerHTML = ahtml`
    <div style="text-align:center">
      <h3 style="margin:0 0 20px 0;color:var(--text-primary)">Suspend Server</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        <button class="btn btn-danger btn-full" id="admin-modal-expire-now" style="justify-content:center">Expire Now</button>
        <button class="btn btn-ghost btn-full" id="admin-modal-suspend-admin" style="justify-content:center">Suspend Admin</button>
        <button class="btn btn-ghost btn-full" onclick="closeAdminModal()" style="justify-content:center;color:var(--text-secondary)">Cancel</button>
      </div>
    </div>
  `;
  $a('#admin-modal-overlay').style.display = 'flex';

  $a('#admin-modal-expire-now').addEventListener('click', async () => {
    const btn = $a('#admin-modal-expire-now');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      await adminApi(`/servers/${serverId}/renew-now`, { method: 'POST' });
      closeAdminModal();
      renderAdminServerDetail(serverId);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = 'Expire Now';
      closeAdminModal();
      const msgEl = $a('#admin-action-msg');
      if (msgEl) { msgEl.textContent = err.message; msgEl.style.display = 'block'; msgEl.style.color = 'var(--accent-red)'; }
    }
  });

  $a('#admin-modal-suspend-admin').addEventListener('click', () => {
    content.innerHTML = ahtml`
      <div>
        <h3 style="margin:0 0 16px 0;color:var(--text-primary)">Suspend Admin</h3>
        <div class="form-group" style="margin-bottom:16px">
          <label for="admin-modal-reason">Reason (optional)</label>
          <textarea id="admin-modal-reason" rows="2" placeholder="Enter reason for suspension..." style="resize:vertical;width:100%;padding:10px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:0.88rem;margin-top:6px;box-sizing:border-box"></textarea>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-full" id="admin-modal-confirm-suspend" style="justify-content:center">Confirm Suspend</button>
          <button class="btn btn-ghost btn-full" onclick="showSuspendModal(${serverId})" style="justify-content:center">Back</button>
        </div>
      </div>
    `;

    $a('#admin-modal-confirm-suspend').addEventListener('click', async () => {
      const btn = $a('#admin-modal-confirm-suspend');
      const reason = $a('#admin-modal-reason')?.value?.trim() || '';
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';
      try {
        await adminApi(`/servers/${serverId}/suspend`, {
          method: 'POST',
          body: JSON.stringify({ reason: reason || undefined }),
        });
        closeAdminModal();
        renderAdminServerDetail(serverId);
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = 'Confirm Suspend';
        closeAdminModal();
        const msgEl = $a('#admin-action-msg');
        if (msgEl) { msgEl.textContent = err.message; msgEl.style.display = 'block'; msgEl.style.color = 'var(--accent-red)'; }
      }
    });
  });
}

// ─── Send Notification Modal ───────────────────────────
function showNotifyModal(userId) {
  const content = $a('#admin-modal-content');
  const overlay = $a('#admin-modal-overlay');
  if (!content || !overlay) return;

  content.innerHTML = ahtml`
    <div>
      <h3 style="margin:0 0 16px 0;color:var(--text-primary)">Send Notification</h3>
      <form id="admin-notify-modal-form">
        <div class="form-group" style="margin-bottom:12px">
          <label for="admin-notify-title">Title</label>
          <input type="text" id="admin-notify-title" placeholder="e.g. Account Update" style="width:100%" required />
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label for="admin-notify-message">Message</label>
          <textarea id="admin-notify-message" rows="3" placeholder="Write your message..." style="resize:vertical;width:100%;padding:10px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:0.88rem;margin-top:6px;box-sizing:border-box" required></textarea>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label for="admin-notify-type">Type</label>
          <select id="admin-notify-type" style="width:100%">
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary btn-full" id="admin-btn-send-notification" style="justify-content:center">Send</button>
          <button type="button" class="btn btn-ghost btn-full" onclick="closeAdminModal()" style="justify-content:center">Cancel</button>
        </div>
        <div id="admin-notify-modal-msg" style="margin-top:12px;display:none"></div>
      </form>
    </div>
  `;
  overlay.style.display = 'flex';

  $a('#admin-notify-modal-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $a('#admin-btn-send-notification');
    const msgEl = $a('#admin-notify-modal-msg');
    const titleEl = $a('#admin-notify-title');
    const messageEl = $a('#admin-notify-message');
    const typeEl = $a('#admin-notify-type');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending...';
    if (msgEl) msgEl.style.display = 'none';
    try {
      await adminApi(`/users/${userId}/notify`, {
        method: 'POST',
        body: JSON.stringify({
          title: titleEl.value.trim(),
          message: messageEl.value.trim(),
          type: typeEl.value,
        }),
      });
      if (msgEl) { msgEl.textContent = 'Notification sent successfully'; msgEl.style.display = 'block'; msgEl.style.color = 'var(--accent-green)'; }
      setTimeout(() => { closeAdminModal(); }, 1200);
    } catch (err) {
      if (msgEl) { msgEl.textContent = err.message; msgEl.style.display = 'block'; msgEl.style.color = 'var(--accent-red)'; }
      btn.disabled = false;
      btn.innerHTML = 'Send';
    }
  });
}

// ─── Send Notification to All Users Modal ───────────────
function showNotifyAllModal() {
  const content = $a('#admin-modal-content');
  const overlay = $a('#admin-modal-overlay');
  if (!content || !overlay) return;

  content.innerHTML = ahtml`
    <div>
      <h3 style="margin:0 0 16px 0;color:var(--text-primary)">Notify All Users</h3>
      <form id="admin-notify-all-form">
        <div class="form-group" style="margin-bottom:12px">
          <label for="admin-notify-all-title">Title</label>
          <input type="text" id="admin-notify-all-title" placeholder="e.g. Platform Update" style="width:100%" required />
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label for="admin-notify-all-message">Message</label>
          <textarea id="admin-notify-all-message" rows="3" placeholder="Write your message to all users..." style="resize:vertical;width:100%;padding:10px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:0.88rem;margin-top:6px;box-sizing:border-box" required></textarea>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label for="admin-notify-all-type">Type</label>
          <div class="custom-select" id="admin-notify-all-type">
            <div class="custom-select-trigger" tabindex="0">
              <span class="custom-select-label">Info</span>
              <i data-lucide="chevron-down" class="custom-select-arrow" style="width:16px;height:16px"></i>
            </div>
            <div class="custom-select-dropdown">
              <div class="custom-select-option" data-value="info">Info</div>
              <div class="custom-select-option" data-value="success">Success</div>
              <div class="custom-select-option" data-value="warning">Warning</div>
              <div class="custom-select-option" data-value="error">Error</div>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary btn-full" id="admin-btn-send-notify-all" style="justify-content:center">Send to All Users</button>
          <button type="button" class="btn btn-ghost btn-full" onclick="closeAdminModal()" style="justify-content:center">Cancel</button>
        </div>
        <div id="admin-notify-all-msg" style="margin-top:12px;display:none"></div>
      </form>
    </div>
  `;
  overlay.style.display = 'flex';
  initIcons();

  const nTypeSelect = $a('#admin-notify-all-type');
  if (nTypeSelect) {
    const nTrigger = nTypeSelect.querySelector('.custom-select-trigger');
    const nLabel = nTypeSelect.querySelector('.custom-select-label');
    nTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
      nTypeSelect.classList.add('open');
    });
    nTypeSelect.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        nLabel.textContent = opt.textContent;
        nTypeSelect.dataset.selectedValue = opt.dataset.value;
        nTypeSelect.classList.remove('open');
      });
    });
    document.addEventListener('click', () => {
      nTypeSelect.classList.remove('open');
    });
  }

  $a('#admin-notify-all-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $a('#admin-btn-send-notify-all');
    const msgEl = $a('#admin-notify-all-msg');
    const titleEl = $a('#admin-notify-all-title');
    const messageEl = $a('#admin-notify-all-message');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending...';
    if (msgEl) msgEl.style.display = 'none';
    try {
      const data = await adminApi('/notify-all', {
        method: 'POST',
        body: JSON.stringify({
          title: titleEl.value.trim(),
          message: messageEl.value.trim(),
          type: nTypeSelect.dataset.selectedValue || 'info',
        }),
      });
      if (msgEl) { msgEl.textContent = `Notification sent to ${data.count} user(s) successfully`; msgEl.style.display = 'block'; msgEl.style.color = 'var(--accent-green)'; }
      setTimeout(() => { closeAdminModal(); }, 1500);
    } catch (err) {
      if (msgEl) { msgEl.textContent = err.message; msgEl.style.display = 'block'; msgEl.style.color = 'var(--accent-red)'; }
      btn.disabled = false;
      btn.innerHTML = 'Send to All Users';
    }
  });
}

// ─── Dashboard ──────────────────────────────────────────
async function renderAdminDashboard() {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  const el = $a('#admin-page-dashboard');
  if (!el) return;
  el.classList.add('active');

  el.innerHTML = ahtml`
    <div class="page-header">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-subtitle">Platform overview</p>
    </div>
    <div class="stat-cards" id="admin-stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:32px">
      <div class="card" style="text-align:center;padding:24px"><span class="spinner"></span></div>
    </div>
  `;

  try {
    const data = await adminApi('/stats');
    const stats = data.stats;
    const cards = [
      { label: 'Total Users', value: stats.total_users, color: 'var(--accent-cyan)' },
      { label: 'Total Servers', value: stats.total_servers, color: 'var(--accent-1)' },
      { label: 'Active Servers', value: stats.active_servers, color: 'var(--accent-green)' },
      { label: 'Suspended', value: stats.suspended_servers, color: 'var(--accent-red)' },
      { label: 'Expired', value: stats.expired_servers, color: 'var(--accent-orange)' },
      { label: 'New Users (24h)', value: stats.new_users_24h, color: 'var(--accent-cyan)' },
    ];
    el.innerHTML = ahtml`
      <div class="page-header">
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Platform overview</p>
      </div>
      <div class="stat-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:32px">
        ${cards.map(c => ahtml`
          <div class="card" style="text-align:center;padding:24px">
            <div style="font-size:2rem;font-weight:800;color:${c.color}">${c.value}</div>
            <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px">${c.label}</div>
          </div>
        `).join('')}
      </div>
      <div class="card" id="admin-server-status-card" style="display:none">
        <div class="card-header">
          <h2 class="card-title">Server Status Distribution</h2>
        </div>
        <div class="chart-container">
          <canvas id="admin-server-status-chart"></canvas>
        </div>
      </div>
    `;

    if (typeof Chart !== 'undefined') {
      if (adminState._chart) adminState._chart.destroy();
      const card = document.getElementById('admin-server-status-card');
      card.style.display = 'block';
      const ctx = document.getElementById('admin-server-status-chart').getContext('2d');
      adminState._chart = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: ['Active', 'Suspended', 'Expired'],
          datasets: [{
            data: [stats.active_servers, stats.suspended_servers, stats.expired_servers],
            backgroundColor: ['#059669', '#ef4444', '#f59e0b'],
            borderColor: '#1c1917',
            borderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#a8a29e', padding: 16, usePointStyle: true }
            }
          }
        }
      });
    }
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-title">Error</div><div class="empty-state-desc">${err.message}</div></div>`;
  }
}

// ─── Users List ─────────────────────────────────────────
async function renderAdminUsers() {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  const el = $a('#admin-page-users');
  if (!el) return;
  el.classList.add('active');

  el.innerHTML = ahtml`
    <div class="page-header">
      <h1 class="page-title">Users</h1>
      <p class="page-subtitle">All registered users</p>
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Username</th>
            <th>Email</th>
            <th>Admin</th>
            <th>Servers</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="admin-users-tbody">
          <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-secondary)"><span class="spinner"></span> Loading...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  try {
    const data = await adminApi('/users');
    const tbody = $a('#admin-users-tbody');
    if (!tbody) return;

    if (data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-secondary)">No users found.</td></tr>';
      return;
    }

    tbody.innerHTML = data.users.map(u => ahtml`
      <tr>
        <td data-label="ID">${u.id}</td>
        <td data-label="Username"><strong>${escapeHtml(u.username)}</strong></td>
        <td data-label="Email">${escapeHtml(u.email)}</td>
        <td data-label="Role">${u.is_admin ? '<span class="server-card-status status-active" style="font-size:0.75rem">Admin</span>' : '<span class="server-card-status status-installing" style="font-size:0.75rem">User</span>'}</td>
        <td data-label="Servers">${u.server_count}</td>
        <td data-label="Created">${formatDateWithTooltip(u.created_at)}</td>
        <td data-label="Actions">
          <a class="btn btn-ghost btn-sm" href="/admin/user/${u.id}" onclick="event.preventDefault();adminNavigateTo('user/${u.id}')">Details</a>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    const tbody = $a('#admin-users-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--accent-red)">Error: ${err.message}</td></tr>`;
  }
  initIcons();
}

// ─── User Detail ────────────────────────────────────────
async function renderAdminUserDetail(userId) {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  const el = $a('#admin-page-user-detail');
  if (!el) return;
  el.classList.add('active');

  el.innerHTML = ahtml`
    <div style="text-align:center;padding:32px;color:var(--text-secondary)"><span class="spinner"></span> Loading user details...</div>
  `;

  try {
    const data = await adminApi(`/users/${userId}`);
    const u = data.user;

    el.innerHTML = ahtml`
      <div class="page-header">
        <a href="/admin/users" onclick="event.preventDefault();adminNavigateTo('users')" class="btn btn-ghost btn-sm" style="display:inline-flex;width:auto;margin-bottom:16px">
          <i data-lucide="arrow-left" style="width:14px;height:14px"></i>
          Back to Users
        </a>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <h1 class="page-title" style="margin-bottom:0">${escapeHtml(u.username)}</h1>
          ${u.restricted ? '<span class="server-card-status status-suspended" style="font-size:0.75rem">Restricted</span>' : '<span class="server-card-status status-active" style="font-size:0.75rem">Active</span>'}
          ${u.auth_restricted ? '<span class="server-card-status status-suspended" style="font-size:0.75rem">Auth Restricted</span>' : ''}
        </div>
      </div>

      <div class="tabs" id="admin-user-tabs">
        <button class="tab active" data-tab="info">Info</button>
        <button class="tab" data-tab="servers">Servers (${data.servers.length})</button>
        <button class="tab" data-tab="admin">Admin</button>
        <div class="tab-indicator" id="admin-user-tab-indicator"></div>
      </div>

      <div id="admin-user-tab-info" class="tab-content" style="display:block">
        <div class="server-detail-grid">
          <div class="card">
            <h2 class="card-title" style="margin-bottom:16px">User Info</h2>
            <div class="detail-list">
              <div class="detail-item"><span class="detail-label">ID</span><span class="detail-value">${u.id}</span></div>
              <div class="detail-item"><span class="detail-label">Username</span><span class="detail-value">${u.username}</span></div>
              <div class="detail-item"><span class="detail-label">Email</span><span class="detail-value">${u.email}</span></div>
              <div class="detail-item"><span class="detail-label">Role</span><span class="detail-value">${u.is_admin ? '<span class="server-card-status status-active" style="font-size:0.75rem">Admin</span>' : '<span class="server-card-status status-installing" style="font-size:0.75rem">User</span>'}</span></div>
              <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value">${u.restricted ? '<span class="server-card-status status-suspended" style="font-size:0.75rem">Restricted</span>' : '<span class="server-card-status status-active" style="font-size:0.75rem">Active</span>'} ${u.auth_restricted ? '<span class="server-card-status status-suspended" style="font-size:0.75rem">Auth Restricted</span>' : ''}</span></div>
              <div class="detail-item"><span class="detail-label">Ptero ID</span><span class="detail-value" style="font-family:monospace">${u.ptero_user_id || 'N/A'}</span></div>
              <div class="detail-item"><span class="detail-label">API Key Set</span><span class="detail-value">${u.ptero_client_api_key ? 'Yes' : 'No'}</span></div>
              <div class="detail-item"><span class="detail-label">Created</span><span class="detail-value">${formatDateWithTooltip(u.created_at)}</span></div>
            </div>
          </div>
          <div class="card">
            <h2 class="card-title" style="margin-bottom:16px">IP Addresses</h2>
            ${data.ips && data.ips.length > 0 ? ahtml`
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                ${data.ips.map(ip => ahtml`<span class="server-detail-tag" style="font-family:monospace">${ip.ip_address}</span>`).join('')}
              </div>
            ` : '<p style="color:var(--text-secondary)">No IPs recorded.</p>'}
          </div>
        </div>
      </div>

      <div id="admin-user-tab-servers" class="tab-content" style="display:none">
        <div class="card">
          <h2 class="card-title" style="margin-bottom:16px">Servers (${data.servers.length})</h2>
          ${data.servers.length > 0 ? ahtml`
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.servers.map(s => ahtml`
                    <tr>
                      <td data-label="Name"><strong>${s.server_name || 'Unknown'}</strong></td>
                      <td data-label="Status"><span class="server-card-status ${s.status === 'active' ? 'status-active' : s.status === 'suspended' ? 'status-suspended' : 'status-installing'}" style="font-size:0.75rem;text-transform:capitalize">${s.status}</span></td>
                      <td data-label="Created">${formatDateWithTooltip(s.created_at)}</td>
                      <td data-label="Expires">${formatDateWithTooltip(s.expires_at)}</td>
                      <td data-label="Actions" style="display:flex;gap:6px;flex-wrap:wrap">
                        <a class="btn btn-ghost btn-sm" href="/admin/server/${s.ptero_server_id}" onclick="event.preventDefault();adminNavigateTo('server/${s.ptero_server_id}')">Manage</a>
                        <a class="btn btn-ghost btn-sm" href="${PTERO_URL}/server/${s.identifier}" target="_blank">Open Pyrodactyl</a>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p style="color:var(--text-secondary)">No servers.</p>'}
        </div>
      </div>

      <div id="admin-user-tab-admin" class="tab-content" style="display:none">
        <div class="server-detail-grid">
          <div class="card">
            <h2 class="card-title" style="margin-bottom:16px;color:var(--accent-orange)">Restrictions</h2>
            <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:12px">
              Restrict user features or authentication access.
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn ${u.restricted ? 'btn-primary' : 'btn-warning'}" id="admin-btn-toggle-restriction" style="width:auto">${u.restricted ? 'Unrestrict User' : 'Restrict User'}</button>
              <button class="btn ${u.auth_restricted ? 'btn-primary' : 'btn-warning'}" id="admin-btn-toggle-auth-restriction" style="width:auto">${u.auth_restricted ? 'Unrestrict Auth' : 'Restrict Auth'}</button>
            </div>
          </div>
          <div class="card">
            <h2 class="card-title" style="margin-bottom:16px;color:var(--accent-1)">Send Notification</h2>
            <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:12px">
              Send a message to this user's notification inbox.
            </p>
            <button class="btn btn-primary" id="admin-btn-show-notify-modal" style="width:auto">Send a Notification</button>
          </div>
          <div class="card">
            <h2 class="card-title" style="margin-bottom:16px;color:var(--accent-red)">Danger Zone</h2>
            <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:12px">
              Toggle admin privileges or delete this user.
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn ${u.is_admin ? 'btn-warning' : 'btn-primary'}" id="admin-btn-toggle-admin" style="width:auto">${u.is_admin ? 'Remove Admin' : 'Make Admin'}</button>
              <button class="btn btn-danger" id="admin-btn-delete-user" style="width:auto">Delete User</button>
            </div>
          </div>
        </div>
      </div>

      <div id="admin-user-action-msg" style="margin-top:12px;display:none"></div>
    `;

    initUserTabs(userId);
    initUserActions(userId);
    initIcons();
  } catch (err) {
    el.innerHTML = ahtml`
      <div class="page-header">
        <a href="/admin/users" onclick="event.preventDefault();adminNavigateTo('users')" class="btn btn-ghost btn-sm" style="display:inline-flex;width:auto;margin-bottom:16px">Back to Users</a>
      </div>
      <div class="empty-state">
        <div class="empty-state-title">User not found</div>
        <div class="empty-state-desc">${err.message}</div>
      </div>
    `;
  }
}

function initUserTabs(userId) {
  const tabs = $a('#admin-user-tabs');
  if (!tabs) return;
  const indicator = $a('#admin-user-tab-indicator');
  const btns = tabs.querySelectorAll('.tab');

  function switchTab(tabBtn) {
    const tabName = tabBtn.dataset.tab;
    btns.forEach(t => t.classList.remove('active'));
    tabBtn.classList.add('active');

    document.querySelectorAll('#admin-page-user-detail .tab-content').forEach(c => c.style.display = 'none');
    const target = $a('#admin-user-tab-' + tabName);
    if (target) target.style.display = 'block';

    if (indicator) {
      indicator.style.left = tabBtn.offsetLeft + 'px';
      indicator.style.width = tabBtn.offsetWidth + 'px';
    }

    history.pushState({ adminPage: 'user', userId, tab: tabName }, '', `/admin/user/${userId}/${tabName}`);
  }

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      switchTab(btn);
    });
  });

  const pathParts = window.location.pathname.replace('/admin/', '').split('/');
  const tabFromUrl = pathParts[2];
  if (tabFromUrl) {
    const tabBtn = Array.from(btns).find(b => b.dataset.tab === tabFromUrl);
    if (tabBtn) {
      switchTab(tabBtn);
      return;
    }
  }

  const activeBtn = tabs.querySelector('.tab.active');
  if (activeBtn && indicator) {
    indicator.style.left = activeBtn.offsetLeft + 'px';
    indicator.style.width = activeBtn.offsetWidth + 'px';
  }
}

function initUserActions(userId) {
  const msgEl = $a('#admin-user-action-msg');
  function showMsg(text, type = 'success') {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.display = 'block';
    msgEl.style.color = type === 'error' ? 'var(--accent-red)' : 'var(--accent-green)';
  }
  function clearMsg() {
    if (msgEl) msgEl.style.display = 'none';
  }

  $a('#admin-btn-toggle-admin')?.addEventListener('click', async () => {
    const btn = $a('#admin-btn-toggle-admin');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Updating...';
    clearMsg();
    try {
      const data = await adminApi(`/users/${userId}/toggle-admin`, { method: 'POST' });
      showMsg(data.is_admin ? 'Admin privileges granted' : 'Admin privileges revoked');
      setTimeout(() => renderAdminUserDetail(userId), 1500);
    } catch (err) {
      showMsg(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Toggle Admin';
    }
  });

  $a('#admin-btn-toggle-restriction')?.addEventListener('click', async () => {
    const btn = $a('#admin-btn-toggle-restriction');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Updating...';
    clearMsg();
    try {
      const data = await adminApi(`/users/${userId}/toggle-restriction`, { method: 'POST' });
      showMsg(data.restricted ? 'Account restricted' : 'Account unrestricted');
      setTimeout(() => renderAdminUserDetail(userId), 1500);
    } catch (err) {
      showMsg(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Toggle Restriction';
    }
  });

  $a('#admin-btn-toggle-auth-restriction')?.addEventListener('click', async () => {
    const btn = $a('#admin-btn-toggle-auth-restriction');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Updating...';
    clearMsg();
    try {
      const data = await adminApi(`/users/${userId}/toggle-auth-restriction`, { method: 'POST' });
      showMsg(data.auth_restricted ? 'Auth restricted' : 'Auth unrestricted');
      setTimeout(() => renderAdminUserDetail(userId), 1500);
    } catch (err) {
      showMsg(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Toggle Auth Restriction';
    }
  });

  $a('#admin-btn-show-notify-modal')?.addEventListener('click', () => {
    showNotifyModal(userId);
  });

  $a('#admin-btn-delete-user')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to permanently delete this user? All their servers will be deleted. This action cannot be undone.')) return;
    const btn = $a('#admin-btn-delete-user');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Deleting...';
    clearMsg();
    try {
      await adminApi(`/users/${userId}`, { method: 'DELETE' });
      showMsg('User deleted');
      setTimeout(() => adminNavigateTo('users'), 1500);
    } catch (err) {
      showMsg(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Delete User';
    }
  });
}

// ─── Settings ───────────────────────────────────────────
async function renderAdminSettings() {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  const el = $a('#admin-page-settings');
  if (!el) return;
  el.classList.add('active');
  el.innerHTML = ahtml`
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
      <p class="page-subtitle">Admin panel configuration</p>
    </div>
    <div class="settings-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
      <div class="card settings-card" style="cursor:pointer;padding:24px;transition:var(--transition);border:1px solid var(--border);border-radius:var(--radius-md)" id="settings-eggs-entry" onmouseover="this.style.borderColor='var(--accent-1)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:1.5rem;margin-bottom:8px">
          <i data-lucide="egg" style="width:32px;height:32px;color:var(--accent-1)"></i>
        </div>
        <h2 class="card-title" style="margin-bottom:4px">Eggs Settings</h2>
        <p style="color:var(--text-secondary);font-size:0.85rem;margin:0">Manage nests, eggs, and per-egg resource overrides</p>
      </div>
      <div class="card settings-card" style="cursor:pointer;padding:24px;transition:var(--transition);border:1px solid var(--border);border-radius:var(--radius-md)" id="settings-notify-all-entry" onmouseover="this.style.borderColor='var(--accent-1)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:1.5rem;margin-bottom:8px">
          <i data-lucide="megaphone" style="width:32px;height:32px;color:var(--accent-1)"></i>
        </div>
        <h2 class="card-title" style="margin-bottom:4px">Send Notification to All Users</h2>
        <p style="color:var(--text-secondary);font-size:0.85rem;margin:0">Send a message to every user's notification inbox</p>
      </div>
    </div>
  `;
  $a('#settings-eggs-entry')?.addEventListener('click', () => adminNavigateTo('settings/eggs'));
  $a('#settings-notify-all-entry')?.addEventListener('click', () => showNotifyAllModal());
  initIcons();
}

// ─── Eggs Settings: Nests List ──────────────────────────
async function renderAdminEggsSettings() {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  const el = $a('#admin-page-settings');
  if (!el) return;
  el.classList.add('active');
  el.innerHTML = ahtml`
    <div class="page-header">
      <a href="/admin/settings" onclick="event.preventDefault();adminNavigateTo('settings')" class="btn btn-ghost btn-sm" style="display:inline-flex;width:auto;margin-bottom:16px">
          <i data-lucide="arrow-left" style="width:14px;height:14px"></i>
          Back to Settings
      </a>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <h1 class="page-title" style="margin-bottom:0">Eggs Settings</h1>
        <button class="btn btn-primary" id="btn-add-nests" style="width:auto">+ Add Nests</button>
      </div>
      <p class="page-subtitle">Manage nests available for server creation</p>
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Local ID</th>
            <th>Logo</th>
            <th>Name</th>
            <th>Description</th>
            <th>Panel Nest ID</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="admin-nests-tbody">
          <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-secondary)"><span class="spinner"></span> Loading...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  $a('#btn-add-nests')?.addEventListener('click', showAddNestsModal);

  try {
    const data = await adminApi('/settings/nests');
    const tbody = $a('#admin-nests-tbody');
    if (!tbody) return;

    if (data.nests.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-secondary)">No nests configured. Click "Add Nests" to add some.</td></tr>';
      return;
    }

    tbody.innerHTML = data.nests.map(n => ahtml`
      <tr>
        <td data-label="ID">${n.id}</td>
        <td data-label="Logo">${n.logo ? renderLogoDisplay(n.logo, 32) : '<span style="color:var(--text-secondary);font-size:0.75rem">—</span>'}</td>
        <td data-label="Name"><a href="/admin/settings/eggs/${n.ptero_nest_id}" onclick="event.preventDefault();adminNavigateTo('settings/eggs/${n.ptero_nest_id}')" style="font-weight:600;cursor:pointer">${n.name}</a></td>
        <td data-label="Description" style="color:var(--text-secondary);font-size:0.85rem;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n.description || '—'}</td>
        <td data-label="Panel ID"><span class="server-detail-tag">${n.ptero_nest_id}</span></td>
        <td data-label="Status">
          <label class="toggle-switch" style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0">
            <input type="checkbox" class="nest-unavailable-toggle" data-id="${n.id}" ${n.unavailable ? 'checked' : ''} style="opacity:0;width:0;height:0">
            <span class="toggle-slider" style="position:absolute;cursor:pointer;inset:0;background:var(--bg-secondary);border:1px solid var(--border);border-radius:24px;transition:0.2s"></span>
          </label>
          <span class="nest-status-label" data-id="${n.id}" style="margin-left:8px;font-size:0.82rem;${n.unavailable ? 'color:var(--accent-red)' : 'color:var(--accent-green)'}">${n.unavailable ? 'Unavailable' : 'Available'}</span>
        </td>
        <td data-label="Actions" style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm btn-rename-nest" data-id="${n.id}" data-name="${n.name}" data-logo="${n.logo || ''}" data-description="${(n.description || '').replace(/"/g, '&quot;')}" style="width:auto">Edit</button>
          <button class="btn btn-danger btn-sm btn-delete-nest" data-id="${n.id}" data-name="${n.name}" style="width:auto">Delete</button>
        </td>
      </tr>
    `).join('');

    if (window.lucide) lucide.createIcons();

    tbody.querySelectorAll('.nest-unavailable-toggle').forEach(toggle => {
      toggle.addEventListener('change', async () => {
        const nestId = parseInt(toggle.dataset.id, 10);
        const label = tbody.querySelector(`.nest-status-label[data-id="${nestId}"]`);
        try {
          await adminApi(`/settings/nests/${nestId}`, {
            method: 'PUT',
            body: JSON.stringify({ unavailable: toggle.checked }),
          });
          if (label) {
            label.textContent = toggle.checked ? 'Unavailable' : 'Available';
            label.style.color = toggle.checked ? 'var(--accent-red)' : 'var(--accent-green)';
          }
        } catch (err) {
          toggle.checked = !toggle.checked;
          showToast(err.message, 'error');
        }
      });
    });

    tbody.querySelectorAll('.btn-rename-nest').forEach(btn => {
      btn.addEventListener('click', () => {
        showRenameNestModal(btn.dataset.id, btn.dataset.name, btn.dataset.logo, btn.dataset.description);
      });
    });
    tbody.querySelectorAll('.btn-delete-nest').forEach(btn => {
      btn.addEventListener('click', () => {
        showDeleteNestConfirm(btn.dataset.id, btn.dataset.name);
      });
    });
  } catch (err) {
    const tbody = $a('#admin-nests-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--accent-red)">Error: ${err.message}</td></tr>`;
  }
}

// ─── Eggs Settings: Nest Eggs ───────────────────────────
async function renderAdminNestEggs(nestId) {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  const el = $a('#admin-page-settings');
  if (!el) return;
  el.classList.add('active');
  el.innerHTML = ahtml`
    <div class="page-header">
      <a href="/admin/settings/eggs" onclick="event.preventDefault();adminNavigateTo('settings/eggs')" class="btn btn-ghost btn-sm" style="display:inline-flex;width:auto;margin-bottom:16px">
          <i data-lucide="arrow-left" style="width:14px;height:14px"></i>
          Back to Nests
      </a>
      <h1 class="page-title" style="margin-bottom:0">Eggs</h1>
      <p class="page-subtitle">Nest ID: ${nestId}</p>
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Logo</th>
            <th>Name</th>
            <th>Description</th>
            <th>Resources</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="admin-eggs-tbody">
          <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-secondary)"><span class="spinner"></span> Loading...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  try {
    const data = await adminApi(`/settings/nests/${nestId}/eggs`);
    const tbody = $a('#admin-eggs-tbody');
    if (!tbody) return;

    if (data.eggs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-secondary)">No eggs found in this nest.</td></tr>';
      return;
    }

    tbody.innerHTML = data.eggs.map(e => {
      const res = e.customResources;
      const resStr = res
        ? `CPU: ${res.cpu_limit ?? 'default'}% / RAM: ${res.memory_limit ?? 'default'} MB / Disk: ${res.disk_limit ?? 'default'} MB`
        : 'Defaults';
      const isUnavailable = res?.unavailable;
      return ahtml`
        <tr>
          <td data-label="ID">${e.id}</td>
          <td data-label="Logo">${res?.logo ? renderLogoDisplay(res.logo, 28) : '<span style="color:var(--text-secondary);font-size:0.75rem">—</span>'}</td>
          <td data-label="Name"><strong>${e.name}</strong></td>
          <td data-label="Description" style="color:var(--text-secondary);font-size:0.85rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.description || '—'}</td>
          <td data-label="Resources"><span class="server-detail-tag" style="font-size:0.75rem">${resStr}</span></td>
          <td data-label="Status">
            <label class="toggle-switch" style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0">
              <input type="checkbox" class="egg-unavailable-toggle" data-nest="${nestId}" data-egg="${e.id}" ${isUnavailable ? 'checked' : ''} style="opacity:0;width:0;height:0">
              <span class="toggle-slider" style="position:absolute;cursor:pointer;inset:0;background:var(--bg-secondary);border:1px solid var(--border);border-radius:24px;transition:0.2s"></span>
            </label>
            <span class="egg-status-label" data-nest="${nestId}" data-egg="${e.id}" style="margin-left:8px;font-size:0.82rem;${isUnavailable ? 'color:var(--accent-red)' : 'color:var(--accent-green)'}">${isUnavailable ? 'Unavailable' : 'Available'}</span>
          </td>
          <td data-label="Actions">
            <a href="/admin/settings/eggs/${nestId}/${e.id}" onclick="event.preventDefault();adminNavigateTo('settings/eggs/${nestId}/${e.id}')" class="btn btn-ghost btn-sm">Configure</a>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.egg-unavailable-toggle').forEach(toggle => {
      toggle.addEventListener('change', async () => {
        const nId = parseInt(toggle.dataset.nest, 10);
        const eId = parseInt(toggle.dataset.egg, 10);
        const label = tbody.querySelector(`.egg-status-label[data-nest="${nId}"][data-egg="${eId}"]`);
        try {
          await adminApi(`/settings/eggs/${nId}/${eId}`, {
            method: 'PUT',
            body: JSON.stringify({ unavailable: toggle.checked }),
          });
          if (label) {
            label.textContent = toggle.checked ? 'Unavailable' : 'Available';
            label.style.color = toggle.checked ? 'var(--accent-red)' : 'var(--accent-green)';
          }
        } catch (err) {
          toggle.checked = !toggle.checked;
          showToast(err.message, 'error');
        }
      });
    });
  } catch (err) {
    const tbody = $a('#admin-eggs-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--accent-red)">Error: ${err.message}</td></tr>`;
  }
  initIcons();
}

// ─── Eggs Settings: Egg Resource Configuration ──────────
async function renderAdminEggSettings(nestId, eggId) {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  const el = $a('#admin-page-settings');
  if (!el) return;
  el.classList.add('active');
  el.innerHTML = ahtml`
    <div class="page-header">
      <a href="/admin/settings/eggs/${nestId}" onclick="event.preventDefault();adminNavigateTo('settings/eggs/${nestId}')" class="btn btn-ghost btn-sm" style="display:inline-flex;width:auto;margin-bottom:16px">
          <i data-lucide="arrow-left" style="width:14px;height:14px"></i>
          Back to Eggs
      </a>
      <h1 class="page-title" style="margin-bottom:0">Egg Resources</h1>
      <p class="page-subtitle" id="admin-egg-name">Loading...</p>
    </div>
    <div class="card" style="max-width:520px">
      <form id="admin-egg-resources-form">
        <div id="admin-egg-resources-error" class="auth-error" style="margin-bottom:16px"></div>
        <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:20px">
          Set custom resource limits and a logo for this egg.
        </p>
        <div class="form-group">
          <label>Logo</label>
          <div class="logo-type-toggle">
            <button type="button" class="active" data-type="url">Logo URL</button>
            <button type="button" data-type="svg">Choose SVG</button>
          </div>
          <div id="egg-logo-url-section">
            <input type="text" id="egg-logo" placeholder="https://example.com/egg-logo.png" style="width:100%" />
            <div id="egg-logo-preview" style="margin-top:8px;display:none">
              <img src="" alt="" style="max-width:48px;max-height:48px;object-fit:contain;border-radius:4px;border:1px solid var(--border)" />
            </div>
          </div>
          <div id="egg-logo-svg-section" style="display:none">
            <div id="egg-lucide-picker" class="svg-picker">
              <input type="text" class="svg-picker-search" placeholder="Search icons..." />
              <div class="svg-picker-grid">${renderLucidePickerGrid('')}</div>
            </div>
            <div id="egg-lucide-selected-preview" class="logo-preview-box" style="display:none">
              <span class="logo-preview-label"></span>
              <button type="button" class="logo-preview-clear" id="egg-lucide-clear"><i data-lucide="x" style="width:14px;height:14px"></i></button>
            </div>
          </div>
          <input type="hidden" id="egg-logo-type" value="url" />
          <input type="hidden" id="egg-lucide-name" value="" />
        </div>
        <div class="form-group">
          <label for="egg-cpu">CPU Limit (%)</label>
          <input type="number" id="egg-cpu" min="0" placeholder="e.g. 50" style="width:100%" />
        </div>
        <div class="form-group">
          <label for="egg-memory">Memory Limit (MB)</label>
          <input type="number" id="egg-memory" min="0" placeholder="e.g. 512" style="width:100%" />
        </div>
        <div class="form-group">
          <label for="egg-disk">Disk Limit (MB)</label>
          <input type="number" id="egg-disk" min="0" placeholder="e.g. 3072" style="width:100%" />
        </div>
        <div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap">
          <button type="submit" class="btn btn-primary" id="btn-save-egg-resources" style="width:auto">Save</button>
          <button type="button" class="btn btn-warning" id="btn-save-egg-resources-all" style="width:auto">Save for All</button>
          <button type="button" class="btn btn-ghost" id="btn-clear-egg-resources" style="width:auto">Clear Overrides</button>
        </div>
        <div id="admin-egg-apply-all-msg" style="margin-top:12px;display:none"></div>
      </form>
    </div>
  `;

  try {
    const data = await adminApi(`/settings/eggs/${nestId}/${eggId}`);
    const nameEl = $a('#admin-egg-name');
    if (data.egg) nameEl.textContent = data.egg.name + ` (Egg #${eggId})`;

    if (data.resources) {
      if (data.resources.logo != null) {
        const isLucide = data.resources.logo.startsWith('lucide:');
        const isSi = data.resources.logo.startsWith('si:');
        const isIcon = isLucide || isSi;
        const type = isIcon ? 'svg' : 'url';
        $a('#egg-logo-type').value = type;
        $a('#egg-logo-svg-section').style.display = type === 'svg' ? 'block' : 'none';
        $a('#egg-logo-url-section').style.display = type === 'url' ? 'block' : 'none';
        const toggleBtns = $a('#admin-egg-resources-form')?.closest('.card')?.querySelectorAll('.logo-type-toggle button') || [];
        toggleBtns.forEach(b => { b.classList.toggle('active', b.dataset.type === type); });

        if (isLucide) {
          const name = data.resources.logo.slice(7);
          $a('#egg-lucide-name').value = name;
          const prev = $a('#egg-lucide-selected-preview');
          if (prev) {
            prev.style.display = 'flex';
            let iconEl = prev.querySelector('[data-lucide]');
            if (!iconEl) {
              iconEl = document.createElement('i');
              iconEl.style.cssText = 'width:32px;height:32px';
              prev.prepend(iconEl);
            }
            iconEl.setAttribute('data-lucide', name);
            prev.querySelector('.logo-preview-label').textContent = name;
            if (window.lucide) lucide.createIcons({ nodes: [prev] });
          }
          const item = $a('#egg-lucide-picker')?.querySelector(`[data-name="${name}"]`);
          if (item) item.classList.add('selected');
        } else if (isSi) {
          const slug = data.resources.logo.slice(3);
          $a('#egg-logo').value = '';
          $a('#egg-logo-type').value = 'svg';
        } else {
          $a('#egg-logo').value = data.resources.logo;
          const preview = $a('#egg-logo-preview');
          if (preview) { preview.style.display = 'block'; preview.querySelector('img').src = data.resources.logo; }
        }
      }
      if (data.resources.cpu_limit != null) $a('#egg-cpu').value = data.resources.cpu_limit;
      if (data.resources.memory_limit != null) $a('#egg-memory').value = data.resources.memory_limit;
      if (data.resources.disk_limit != null) $a('#egg-disk').value = data.resources.disk_limit;
    }
  } catch (err) {
    const errEl = $a('#admin-egg-resources-error');
    if (errEl) { errEl.textContent = err.message; errEl.classList.add('show'); }
  }

  $a('#egg-logo')?.addEventListener('input', () => {
    const preview = $a('#egg-logo-preview');
    const img = preview?.querySelector('img');
    const val = $a('#egg-logo').value;
    if (val) {
      if (preview) preview.style.display = 'block';
      if (img) img.src = val;
    } else {
      if (preview) preview.style.display = 'none';
    }
  });

  const eggToggleBtns = $a('#admin-egg-resources-form')?.closest('.card')?.querySelectorAll('.logo-type-toggle button') || [];
  eggToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      eggToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type;
      $a('#egg-logo-type').value = type;
      $a('#egg-logo-url-section').style.display = type === 'url' ? 'block' : 'none';
      $a('#egg-logo-svg-section').style.display = type === 'svg' ? 'block' : 'none';
    });
  });

  $a('#egg-lucide-clear')?.addEventListener('click', () => {
    $a('#egg-lucide-name').value = '';
    const prev = $a('#egg-lucide-selected-preview');
    if (prev) prev.style.display = 'none';
    $a('#egg-lucide-picker')?.querySelectorAll('.svg-picker-item').forEach(i => i.classList.remove('selected'));
  });

  $a('#admin-egg-resources-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $a('#btn-save-egg-resources');
    const errEl = $a('#admin-egg-resources-error');
    if (errEl) errEl.classList.remove('show');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';

    const logoType = $a('#egg-logo-type')?.value || 'url';
    let logo = null;
    if (logoType === 'svg') {
      const name = $a('#egg-lucide-name')?.value?.trim();
      logo = name ? `lucide:${name}` : null;
    } else {
      logo = $a('#egg-logo')?.value?.trim() || null;
    }
    const cpu = $a('#egg-cpu').value;
    const memory = $a('#egg-memory').value;
    const disk = $a('#egg-disk').value;

    try {
      await adminApi(`/settings/eggs/${nestId}/${eggId}`, {
        method: 'PUT',
        body: JSON.stringify({
          logo,
          cpu_limit: cpu !== '' ? parseInt(cpu, 10) : null,
          memory_limit: memory !== '' ? parseInt(memory, 10) : null,
          disk_limit: disk !== '' ? parseInt(disk, 10) : null,
        }),
      });
      btn.innerHTML = 'Saved!';
      setTimeout(() => { btn.disabled = false; btn.innerHTML = 'Save'; }, 1500);
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.classList.add('show'); }
      btn.disabled = false;
      btn.innerHTML = 'Save';
    }
  });

  $a('#btn-clear-egg-resources')?.addEventListener('click', async () => {
    if (!confirm('Clear all resource overrides for this egg?')) return;
    const errEl = $a('#admin-egg-resources-error');
    if (errEl) errEl.classList.remove('show');
    try {
      await adminApi(`/settings/eggs/${nestId}/${eggId}`, {
        method: 'PUT',
        body: JSON.stringify({ logo: null, cpu_limit: null, memory_limit: null, disk_limit: null }),
      });
      $a('#egg-logo').value = '';
      $a('#egg-logo-preview').style.display = 'none';
      $a('#egg-lucide-name').value = '';
      $a('#egg-logo-type').value = 'url';
      const eggPrev = $a('#egg-lucide-selected-preview');
      if (eggPrev) eggPrev.style.display = 'none';
      $a('#egg-lucide-picker')?.querySelectorAll('.svg-picker-item').forEach(i => i.classList.remove('selected'));
      const eggToggleBtns = $a('#admin-egg-resources-form')?.closest('.card')?.querySelectorAll('.logo-type-toggle button') || [];
      eggToggleBtns.forEach(b => { b.classList.toggle('active', b.dataset.type === 'url'); });
      $a('#egg-logo-url-section').style.display = 'block';
      $a('#egg-logo-svg-section').style.display = 'none';
      $a('#egg-cpu').value = '';
      $a('#egg-memory').value = '';
      $a('#egg-disk').value = '';
      const btn = $a('#btn-clear-egg-resources');
      btn.textContent = 'Cleared!';
      setTimeout(() => { btn.textContent = 'Clear Overrides'; }, 1500);
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.classList.add('show'); }
    }
  });

  initIcons();

  (async () => {
    const grid = $a('#egg-lucide-picker .svg-picker-grid');
    if (grid) {
      grid.innerHTML = await renderLucidePickerGridLoaded('');
      if (window.lucide) lucide.createIcons({ nodes: [grid] });
      initSvgPickerListeners($a('#egg-lucide-picker'), (name) => {
        $a('#egg-lucide-name').value = name;
        const prev = $a('#egg-lucide-selected-preview');
        if (prev) {
          prev.style.display = 'flex';
          let iconEl = prev.querySelector('[data-lucide]');
          if (!iconEl) {
            iconEl = document.createElement('i');
            iconEl.style.cssText = 'width:32px;height:32px';
            prev.prepend(iconEl);
          }
          iconEl.setAttribute('data-lucide', name);
          prev.querySelector('.logo-preview-label').textContent = name;
          if (window.lucide) lucide.createIcons({ nodes: [prev] });
        }
      });
    }
  })();

  $a('#btn-save-egg-resources-all')?.addEventListener('click', async () => {
    if (!confirm('Apply these resources to ALL existing servers using this egg? This will update their limits on the panel.')) return;
    const btn = $a('#btn-save-egg-resources-all');
    const msgEl = $a('#admin-egg-apply-all-msg');
    const errEl = $a('#admin-egg-resources-error');
    if (errEl) errEl.classList.remove('show');
    if (msgEl) { msgEl.style.display = 'none'; }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Applying...';

    const cpu = $a('#egg-cpu').value;
    const memory = $a('#egg-memory').value;
    const disk = $a('#egg-disk').value;

    try {
      const data = await adminApi(`/settings/eggs/${nestId}/${eggId}/apply-all`, {
        method: 'POST',
        body: JSON.stringify({
          cpu_limit: cpu !== '' ? parseInt(cpu, 10) : null,
          memory_limit: memory !== '' ? parseInt(memory, 10) : null,
          disk_limit: disk !== '' ? parseInt(disk, 10) : null,
        }),
      });
      if (msgEl) {
        msgEl.textContent = `Updated ${data.updated} / ${data.total} server(s) successfully.`;
        msgEl.style.display = 'block';
        msgEl.style.color = 'var(--accent-green)';
      }
      btn.innerHTML = 'Done!';
      setTimeout(() => { btn.disabled = false; btn.innerHTML = 'Save for All'; }, 2000);
    } catch (err) {
      if (errEl) { errEl.textContent = err.message; errEl.classList.add('show'); }
      btn.disabled = false;
      btn.innerHTML = 'Save for All';
    }
  });
}

// ─── Add Nests Modal ────────────────────────────────────
async function showAddNestsModal() {
  const content = $a('#admin-modal-content');
  const overlay = $a('#admin-modal-overlay');
  if (!content || !overlay) return;

  if (!$a('#custom-checkbox-style')) {
    const s = document.createElement('style');
    s.id = 'custom-checkbox-style';
    s.textContent = '.add-nest-checkbox { width:20px;height:20px;border:2px solid var(--text-secondary);border-radius:4px;flex-shrink:0;cursor:pointer;appearance:none;-webkit-appearance:none;background:transparent;transition:var(--transition);position:relative } .add-nest-checkbox:checked { background:var(--accent-1);border-color:var(--accent-1) } .add-nest-checkbox:checked::after { content:""; position:absolute; top:3px;left:6px; width:5px;height:9px; border:solid var(--bg-primary); border-width:0 2px 2px 0; transform:rotate(45deg) }';
    document.head.appendChild(s);
  }

  content.innerHTML = '<div style="text-align:center;padding:24px"><span class="spinner"></span> Loading available nests...</div>';
  overlay.style.display = 'flex';

  try {
    const data = await adminApi('/settings/nests/available');
    if (data.nests.length === 0) {
      content.innerHTML = ahtml`
        <div style="text-align:center">
          <h3 style="margin:0 0 16px 0;color:var(--text-primary)">Add Nests</h3>
          <p style="color:var(--text-secondary)">All available nests from the panel have already been added.</p>
          <button class="btn btn-ghost" onclick="closeAdminModal()" style="margin-top:16px;width:auto">Close</button>
        </div>
      `;
      return;
    }

    content.innerHTML = ahtml`
      <div>
        <h3 style="margin:0 0 16px 0;color:var(--text-primary)">Add Nests</h3>
        <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px">Select nests from the panel to make them available:</p>
        <div id="add-nests-list" style="max-height:300px;overflow-y:auto;margin-bottom:16px">
          ${data.nests.map(n => ahtml`
            <label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer">
              <input type="checkbox" class="add-nest-checkbox" value="${n.id}" data-name="${n.name}" />
              <span><strong>${n.name}</strong> <span style="color:var(--text-secondary);font-size:0.82rem">(ID: ${n.id})</span></span>
            </label>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-full" id="btn-confirm-add-nests" style="justify-content:center">Add Selected</button>
          <button class="btn btn-ghost btn-full" onclick="closeAdminModal()" style="justify-content:center">Cancel</button>
        </div>
        <div id="add-nests-error" style="margin-top:12px;color:var(--accent-red);display:none"></div>
      </div>
    `;

    $a('#btn-confirm-add-nests')?.addEventListener('click', async () => {
      const checked = document.querySelectorAll('.add-nest-checkbox:checked');
      if (checked.length === 0) {
        const err = $a('#add-nests-error');
        if (err) { err.textContent = 'Select at least one nest'; err.style.display = 'block'; }
        return;
      }

      const btn = $a('#btn-confirm-add-nests');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Adding...';

      let added = 0;
      let errors = [];

      for (const cb of checked) {
        try {
          await adminApi('/settings/nests', {
            method: 'POST',
            body: JSON.stringify({ pteroNestId: parseInt(cb.value, 10), name: cb.dataset.name }),
          });
          added++;
        } catch (err) {
          errors.push(`${cb.dataset.name}: ${err.message}`);
        }
      }

      if (errors.length > 0) {
        const errEl = $a('#add-nests-error');
        if (errEl) { errEl.textContent = errors.join('; '); errEl.style.display = 'block'; }
      }

      btn.innerHTML = added > 0 ? `Added ${added} nest(s)!` : 'Failed';
      setTimeout(() => {
        closeAdminModal();
        renderAdminEggsSettings();
      }, 1200);
    });
  } catch (err) {
    content.innerHTML = ahtml`
      <div style="text-align:center">
        <h3 style="margin:0 0 16px 0;color:var(--text-primary)">Error</h3>
        <p style="color:var(--accent-red)">${err.message}</p>
        <button class="btn btn-ghost" onclick="closeAdminModal()" style="margin-top:16px;width:auto">Close</button>
      </div>
    `;
  }
}

// ─── Edit Nest Modal ─────────────────────────────────────
function showRenameNestModal(nestId, currentName, currentLogo, currentDescription) {
  const content = $a('#admin-modal-content');
  const overlay = $a('#admin-modal-overlay');
  if (!content || !overlay) return;

  const isLucide = currentLogo && currentLogo.startsWith('lucide:');
  const isSi = currentLogo && currentLogo.startsWith('si:');
  const isIcon = isLucide || isSi;
  const initialType = isIcon ? 'svg' : 'url';
  const initialSvgSlug = isLucide ? currentLogo.slice(7) : isSi ? currentLogo.slice(3) : '';

  content.innerHTML = ahtml`
    <div>
      <h3 style="margin:0 0 16px 0;color:var(--text-primary)">Edit Nest</h3>
      <div class="form-group" style="margin-bottom:16px">
        <label for="modal-rename-nest-name">Display Name</label>
        <input type="text" id="modal-rename-nest-name" value="${currentName}" style="width:100%" />
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label>Logo</label>
        <div class="logo-type-toggle">
          <button type="button" class="${initialType === 'url' ? 'active' : ''}" data-type="url">Logo URL</button>
          <button type="button" class="${initialType === 'svg' ? 'active' : ''}" data-type="svg">Choose SVG</button>
        </div>
        <div id="nest-logo-url-section" style="display:${initialType === 'url' ? 'block' : 'none'}">
          <input type="text" id="modal-edit-nest-logo" value="${isIcon ? '' : (currentLogo || '')}" placeholder="https://example.com/logo.png" style="width:100%" />
          <div id="modal-nest-logo-preview" style="margin-top:8px;${currentLogo && !isIcon ? '' : 'display:none'}">
            <img src="${isIcon ? '' : (currentLogo || '')}" alt="" style="max-width:64px;max-height:64px;object-fit:contain;border-radius:4px;border:1px solid var(--border)" />
          </div>
        </div>
        <div id="nest-logo-svg-section" style="display:${initialType === 'svg' ? 'block' : 'none'}">
          <div id="nest-lucide-picker" class="svg-picker">
            <input type="text" class="svg-picker-search" placeholder="Search icons..." />
            <div class="svg-picker-grid">${renderLucidePickerGrid(initialSvgSlug)}</div>
          </div>
          <div id="nest-lucide-selected-preview" class="logo-preview-box" style="display:${initialSvgSlug ? 'flex' : 'none'}">
            ${initialSvgSlug ? `<i data-lucide="${initialSvgSlug}" style="width:32px;height:32px"></i>` : ''}
            <span class="logo-preview-label">${initialSvgSlug || ''}</span>
            <button type="button" class="logo-preview-clear" id="nest-svg-clear"><i data-lucide="x" style="width:14px;height:14px"></i></button>
          </div>
        </div>
        <input type="hidden" id="modal-edit-nest-logo-type" value="${initialType}" />
        <input type="hidden" id="modal-edit-nest-svg-slug" value="${initialSvgSlug}" />
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label for="modal-edit-nest-description">Description</label>
        <textarea id="modal-edit-nest-description" rows="3" placeholder="Brief description of this nest" style="width:100%;resize:vertical">${currentDescription || ''}</textarea>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-full" id="btn-confirm-rename-nest" style="justify-content:center">Save</button>
        <button class="btn btn-ghost btn-full" onclick="closeAdminModal()" style="justify-content:center">Cancel</button>
      </div>
      <div id="rename-nest-error" style="margin-top:12px;color:var(--accent-red);display:none"></div>
    </div>
  `;
  overlay.style.display = 'flex';
  initIcons();

  (async () => {
    const grid = $a('#nest-lucide-picker .svg-picker-grid');
    if (grid) {
      grid.innerHTML = await renderLucidePickerGridLoaded(initialSvgSlug);
      if (window.lucide) lucide.createIcons({ nodes: [grid] });
      initSvgPickerListeners($a('#nest-lucide-picker'), (name) => {
        $a('#modal-edit-nest-svg-slug').value = name;
        const prev = $a('#nest-lucide-selected-preview');
        if (prev) {
          prev.style.display = 'flex';
          let iconEl = prev.querySelector('[data-lucide]');
          if (!iconEl) {
            iconEl = document.createElement('i');
            iconEl.style.cssText = 'width:32px;height:32px';
            prev.prepend(iconEl);
          }
          iconEl.setAttribute('data-lucide', name);
          prev.querySelector('.logo-preview-label').textContent = name;
          if (window.lucide) lucide.createIcons({ nodes: [prev] });
        }
      });
    }
  })();

  const toggleBtns = content.querySelectorAll('.logo-type-toggle button');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type;
      $a('#modal-edit-nest-logo-type').value = type;
      $a('#nest-logo-url-section').style.display = type === 'url' ? 'block' : 'none';
      $a('#nest-logo-svg-section').style.display = type === 'svg' ? 'block' : 'none';
    });
  });

  const logoInput = $a('#modal-edit-nest-logo');
  logoInput?.addEventListener('input', () => {
    const preview = $a('#modal-nest-logo-preview');
    const img = preview?.querySelector('img');
    if (logoInput.value) {
      if (preview) preview.style.display = 'block';
      if (img) img.src = logoInput.value;
    } else {
      if (preview) preview.style.display = 'none';
    }
  });

  $a('#nest-svg-clear')?.addEventListener('click', () => {
    $a('#modal-edit-nest-svg-slug').value = '';
    const prev = $a('#nest-lucide-selected-preview');
    if (prev) prev.style.display = 'none';
    $a('#nest-lucide-picker')?.querySelectorAll('.svg-picker-item').forEach(i => i.classList.remove('selected'));
  });

  $a('#btn-confirm-rename-nest')?.addEventListener('click', async () => {
    const name = $a('#modal-rename-nest-name').value.trim();
    const type = $a('#modal-edit-nest-logo-type').value;
    let logo = null;
    if (type === 'svg') {
      const slug = $a('#modal-edit-nest-svg-slug').value.trim();
      logo = slug ? `lucide:${slug}` : null;
    } else {
      logo = $a('#modal-edit-nest-logo').value.trim() || null;
    }
    const description = $a('#modal-edit-nest-description').value.trim() || null;
    if (!name) {
      const err = $a('#rename-nest-error');
      if (err) { err.textContent = 'Name is required'; err.style.display = 'block'; }
      return;
    }

    const btn = $a('#btn-confirm-rename-nest');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
      await adminApi(`/settings/nests/${nestId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, logo, description }),
      });
      closeAdminModal();
      renderAdminEggsSettings();
    } catch (err) {
      const errEl = $a('#rename-nest-error');
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      btn.disabled = false;
      btn.innerHTML = 'Save';
    }
  });
}

// ─── Delete Nest Confirmation ───────────────────────────
function showDeleteNestConfirm(nestId, name) {
  const content = $a('#admin-modal-content');
  const overlay = $a('#admin-modal-overlay');
  if (!content || !overlay) return;

  content.innerHTML = ahtml`
    <div style="text-align:center">
      <h3 style="margin:0 0 12px 0;color:var(--accent-red)">Delete Nest</h3>
      <p style="color:var(--text-secondary);margin-bottom:20px">
        Are you sure you want to delete "<strong>${name}</strong>"?<br />
        This will also remove all egg resource overrides for this nest.
      </p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-danger btn-full" id="btn-confirm-delete-nest" style="justify-content:center">Delete</button>
        <button class="btn btn-ghost btn-full" onclick="closeAdminModal()" style="justify-content:center">Cancel</button>
      </div>
      <div id="delete-nest-error" style="margin-top:12px;color:var(--accent-red);display:none"></div>
    </div>
  `;
  overlay.style.display = 'flex';

  $a('#btn-confirm-delete-nest')?.addEventListener('click', async () => {
    const btn = $a('#btn-confirm-delete-nest');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Deleting...';

    try {
      await adminApi(`/settings/nests/${nestId}`, { method: 'DELETE' });
      closeAdminModal();
      renderAdminEggsSettings();
    } catch (err) {
      const errEl = $a('#delete-nest-error');
      if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      btn.disabled = false;
      btn.innerHTML = 'Delete';
    }
  });
}

// ─── Nodes ──────────────────────────────────────────────
async function renderAdminNodes() {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  const el = $a('#admin-page-nodes');
  if (!el) return;
  el.classList.add('active');
  el.innerHTML = ahtml`
    <div class="page-header">
      <h1 class="page-title">Nodes</h1>
      <p class="page-subtitle">Pterodactyl panel nodes</p>
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>FQDN</th>
            <th>RAM</th>
            <th>Disk</th>
            <th>CPU</th>
            <th>Allocations</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="admin-nodes-tbody">
          <tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-secondary)"><span class="spinner"></span> Loading...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  try {
    const data = await adminApi('/nodes');
    const tbody = $a('#admin-nodes-tbody');
    if (!tbody) return;

    if (data.nodes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-secondary)">No nodes found in the panel.</td></tr>';
      return;
    }

    tbody.innerHTML = data.nodes.map(n => {
      const ramMB = n.memory ? Math.round(n.memory / 1024) : '—';
      const diskGB = n.disk ? (n.disk / 1024).toFixed(1) : '—';
      const cpuPct = n.cpu ? n.cpu + '%' : '—';
      const allocCount = n.allocation_count ?? '—';
      const isOnline = n.is_online;
      return ahtml`
        <tr>
          <td data-label="ID">${n.id}</td>
          <td data-label="Name"><a href="/admin/node/${n.id}" onclick="event.preventDefault();adminNavigateTo('node/${n.id}')" style="font-weight:600;cursor:pointer">${escapeHtml(n.name)}</a></td>
          <td data-label="FQDN"><span class="server-detail-tag">${escapeHtml(n.fqdn)}</span></td>
          <td data-label="RAM">${ramMB !== '—' ? ramMB + ' MB' : '—'}</td>
          <td data-label="Disk">${diskGB !== '—' ? diskGB + ' GB' : '—'}</td>
          <td data-label="CPU">${cpuPct}</td>
          <td data-label="Allocations">${allocCount}</td>
          <td data-label="Status">${isOnline !== undefined ? (isOnline ? '<span style="color:var(--accent-green)">Online</span>' : '<span style="color:var(--accent-red)">Offline</span>') : '—'}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    const tbody = $a('#admin-nodes-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--accent-red)">Error: ${err.message}</td></tr>`;
  }
}

async function renderAdminNodeDetail(nodeId) {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  const el = $a('#admin-page-node-detail');
  if (!el) return;
  el.classList.add('active');
  el.innerHTML = ahtml`
    <div class="page-header">
      <a href="/admin/nodes" onclick="event.preventDefault();adminNavigateTo('nodes')" class="btn btn-ghost btn-sm" style="display:inline-flex;width:auto;margin-bottom:16px">
        <i data-lucide="arrow-left" style="width:14px;height:14px"></i>
        Back to Nodes
      </a>
      <h1 class="page-title" style="margin-bottom:0">Node #${nodeId}</h1>
      <p class="page-subtitle" id="admin-node-name">Loading...</p>
    </div>
    <div class="tabs" id="admin-node-tabs">
      <button class="tab active" data-tab="info">Info</button>
      <button class="tab" data-tab="allocations">Allocations</button>
      <button class="tab" data-tab="servers">Servers</button>
      <button class="tab" data-tab="settings">Settings</button>
      <div class="tab-indicator" id="admin-node-tab-indicator"></div>
    </div>

    <div id="admin-node-tab-info" class="tab-content" style="display:block">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="card" style="padding:20px">
          <h3 style="color:var(--text-secondary);font-size:0.8rem;text-transform:uppercase;margin-bottom:12px">Details</h3>
          <div id="admin-node-details"><span class="spinner"></span></div>
        </div>
        <div class="card" style="padding:20px">
          <h3 style="color:var(--text-secondary);font-size:0.8rem;text-transform:uppercase;margin-bottom:12px">Resources</h3>
          <div id="admin-node-resources"><span class="spinner"></span></div>
        </div>
      </div>
    </div>

    <div id="admin-node-tab-allocations" class="tab-content" style="display:none">
      <div class="card" style="padding:20px">
        <div class="table-container" style="margin:0">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>IP</th>
                <th>Port</th>
                <th>Alias</th>
                <th>Server</th>
              </tr>
            </thead>
            <tbody id="admin-node-alloc-tbody">
              <tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text-secondary)"><span class="spinner"></span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div id="admin-node-tab-servers" class="tab-content" style="display:none">
      <div class="card" style="padding:20px">
        <div class="table-container" style="margin:0">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Identifier</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="admin-node-servers-tbody">
              <tr><td colspan="4" style="text-align:center;padding:16px;color:var(--text-secondary)"><span class="spinner"></span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div id="admin-node-tab-settings" class="tab-content" style="display:none">
      <div class="card" style="padding:24px;max-width:480px">
        <h2 class="card-title" style="margin-bottom:16px">Node Availability</h2>
        <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:20px">
          When a node is set to <strong>Unavailable</strong>, new servers will not be created on it. Existing servers are not affected.
        </p>
        <div id="admin-node-settings-form">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
            <label class="toggle-switch" style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0">
              <input type="checkbox" id="node-unavailable-toggle" style="opacity:0;width:0;height:0">
              <span class="toggle-slider" style="position:absolute;cursor:pointer;inset:0;background:var(--bg-secondary);border:1px solid var(--border);border-radius:24px;transition:0.2s"></span>
            </label>
            <div>
              <div id="node-unavailable-label" style="font-weight:600;font-size:0.9rem">Available</div>
              <div style="color:var(--text-secondary);font-size:0.8rem">Node is accepting new server deployments</div>
            </div>
          </div>
          <div id="node-settings-error" class="auth-error" style="margin-bottom:12px"></div>
          <button class="btn btn-primary" id="btn-save-node-settings" style="width:auto">Save Settings</button>
        </div>
      </div>
    </div>
  `;
  initIcons();

  try {
    const [nodeData, allocData, serversData, settingsData] = await Promise.all([
      adminApi(`/nodes/${nodeId}`),
      adminApi(`/nodes/${nodeId}/allocations`).catch(() => ({ allocations: [] })),
      adminApi(`/nodes/${nodeId}/servers`).catch(() => ({ servers: [] })),
      adminApi(`/nodes/${nodeId}/settings`).catch(() => ({ settings: { unavailable: false } })),
    ]);

    const n = nodeData.node;
    const nameEl = $a('#admin-node-name');
    if (nameEl) nameEl.textContent = escapeHtml(n.name);

    const detailsEl = $a('#admin-node-details');
    if (detailsEl) {
      detailsEl.innerHTML = ahtml`
        <div style="display:grid;gap:8px;font-size:0.88rem">
          <div><span style="color:var(--text-secondary)">FQDN:</span> <strong>${escapeHtml(n.fqdn)}</strong></div>
          <div><span style="color:var(--text-secondary)">Scheme:</span> ${n.scheme || 'https'}</div>
          <div><span style="color:var(--text-secondary)">Port:</span> ${n.port || '—'}</div>
          <div><span style="color:var(--text-secondary)">Daemon Token:</span> <span style="font-family:monospace;font-size:0.8rem">${n.daemon_token ? '••••••••' : '—'}</span></div>
          <div><span style="color:var(--text-secondary)">Status:</span> ${n.is_online !== undefined ? (n.is_online ? '<span style="color:var(--accent-green)">Online</span>' : '<span style="color:var(--accent-red)">Offline</span>') : '—'}</div>
          <div><span style="color:var(--text-secondary)">Communication:</span> ${n.communications || '—'}</div>
        </div>
      `;
    }

    const resEl = $a('#admin-node-resources');
    if (resEl) {
      const memTotal = n.memory ? Math.round(n.memory / 1024) : 0;
      const memUsed = n.memory_allocated ? Math.round(n.memory_allocated / 1024) : 0;
      const diskTotal = n.disk ? (n.disk / 1024).toFixed(1) : 0;
      const diskUsed = n.disk_allocated ? (n.disk_allocated / 1024).toFixed(1) : 0;
      resEl.innerHTML = ahtml`
        <div style="display:grid;gap:12px;font-size:0.88rem">
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>RAM</span><span>${memUsed} / ${memTotal} MB</span></div>
            <div style="background:var(--bg-secondary);border-radius:4px;height:8px;overflow:hidden"><div style="background:var(--accent-1);height:100%;width:${memTotal > 0 ? (memUsed / memTotal * 100) : 0}%;border-radius:4px"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Disk</span><span>${diskUsed} / ${diskTotal} GB</span></div>
            <div style="background:var(--bg-secondary);border-radius:4px;height:8px;overflow:hidden"><div style="background:var(--accent-3);height:100%;width:${diskTotal > 0 ? (diskUsed / diskTotal * 100) : 0}%;border-radius:4px"></div></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>CPU</span><span>${n.cpu || 0}%</span></div>
            <div style="background:var(--bg-secondary);border-radius:4px;height:8px;overflow:hidden"><div style="background:var(--accent-2);height:100%;width:${n.cpu || 0}%;border-radius:4px"></div></div>
          </div>
          <div style="margin-top:4px"><span style="color:var(--text-secondary)">Allocation Count:</span> <strong>${n.allocation_count ?? '—'}</strong></div>
        </div>
      `;
    }

    const allocTbody = $a('#admin-node-alloc-tbody');
    if (allocTbody) {
      const allocs = allocData.allocations || [];
      if (allocs.length === 0) {
        allocTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text-secondary)">No allocations found.</td></tr>';
      } else {
        allocTbody.innerHTML = allocs.map(a => ahtml`
          <tr>
            <td data-label="ID">${a.id}</td>
            <td data-label="IP"><span class="server-detail-tag">${escapeHtml(a.ip)}</span></td>
            <td data-label="Port">${a.port}</td>
            <td data-label="Alias">${a.alias ? escapeHtml(a.alias) : '—'}</td>
            <td data-label="Server">${a.server ? `<span style="color:var(--accent-1)">${a.server}</span>` : '<span style="color:var(--text-secondary)">Free</span>'}</td>
          </tr>
        `).join('');
      }
    }

    const serversTbody = $a('#admin-node-servers-tbody');
    if (serversTbody) {
      const servers = serversData.servers || [];
      if (servers.length === 0) {
        serversTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--text-secondary)">No servers on this node.</td></tr>';
      } else {
        serversTbody.innerHTML = servers.map(s => ahtml`
          <tr>
            <td data-label="ID">${s.id}</td>
            <td data-label="Name">${escapeHtml(s.name)}</td>
            <td data-label="Identifier"><span class="server-detail-tag">${escapeHtml(s.identifier)}</span></td>
            <td data-label="Status"><span class="server-detail-tag">${s.status || '—'}</span></td>
          </tr>
        `).join('');
      }
    }

    const toggle = $a('#node-unavailable-toggle');
    const label = $a('#node-unavailable-label');
    const isUnavailable = !!settingsData.settings?.unavailable;
    if (toggle) {
      toggle.checked = isUnavailable;
      updateNodeSettingsLabel(isUnavailable);
      toggle.addEventListener('change', () => updateNodeSettingsLabel(toggle.checked));
    }

    const saveBtn = $a('#btn-save-node-settings');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Saving...';
        const errEl = $a('#node-settings-error');
        if (errEl) errEl.classList.remove('show');
        try {
          await adminApi(`/nodes/${nodeId}/settings`, {
            method: 'PUT',
            body: JSON.stringify({ unavailable: toggle.checked }),
          });
          saveBtn.innerHTML = 'Saved!';
          setTimeout(() => { saveBtn.disabled = false; saveBtn.innerHTML = 'Save Settings'; }, 1500);
        } catch (err) {
          if (errEl) { errEl.textContent = err.message; errEl.classList.add('show'); }
          saveBtn.disabled = false;
          saveBtn.innerHTML = 'Save Settings';
        }
      });
    }

    initNodeTabs(nodeId);
  } catch (err) {
    el.innerHTML = ahtml`
      <div class="page-header">
        <a href="/admin/nodes" onclick="event.preventDefault();adminNavigateTo('nodes')" class="btn btn-ghost btn-sm" style="display:inline-flex;width:auto;margin-bottom:16px">
          <i data-lucide="arrow-left" style="width:14px;height:14px"></i>
          Back to Nodes
        </a>
        <h1 class="page-title">Error</h1>
        <p style="color:var(--accent-red)">${err.message}</p>
      </div>
    `;
    initIcons();
  }
}

function updateNodeSettingsLabel(isUnavailable) {
  const label = $a('#node-unavailable-label');
  const desc = label?.nextElementSibling;
  if (label) {
    label.textContent = isUnavailable ? 'Unavailable' : 'Available';
    label.style.color = isUnavailable ? 'var(--accent-red)' : '';
  }
  if (desc) {
    desc.textContent = isUnavailable
      ? 'Node will be excluded from new server deployments'
      : 'Node is accepting new server deployments';
  }
}

function initNodeTabs(nodeId) {
  const tabs = $a('#admin-node-tabs');
  if (!tabs) return;
  const indicator = $a('#admin-node-tab-indicator');
  const btns = tabs.querySelectorAll('.tab');

  function switchTab(tabBtn) {
    const tabName = tabBtn.dataset.tab;
    btns.forEach(t => t.classList.remove('active'));
    tabBtn.classList.add('active');

    document.querySelectorAll('#admin-page-node-detail .tab-content').forEach(c => c.style.display = 'none');
    const target = $a('#admin-node-tab-' + tabName);
    if (target) target.style.display = 'block';

    if (indicator) {
      indicator.style.left = tabBtn.offsetLeft + 'px';
      indicator.style.width = tabBtn.offsetWidth + 'px';
    }

    history.pushState({ adminPage: 'node', nodeId, tab: tabName }, '', `/admin/node/${nodeId}/${tabName}`);
  }

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      switchTab(btn);
    });
  });

  const pathParts = window.location.pathname.replace('/admin/', '').split('/');
  const tabFromUrl = pathParts[2];
  if (tabFromUrl) {
    const tabBtn = Array.from(btns).find(b => b.dataset.tab === tabFromUrl);
    if (tabBtn) {
      switchTab(tabBtn);
      return;
    }
  }

  const activeBtn = tabs.querySelector('.tab.active');
  if (activeBtn && indicator) {
    indicator.style.left = activeBtn.offsetLeft + 'px';
    indicator.style.width = activeBtn.offsetWidth + 'px';
  }
}

// ─── Common ─────────────────────────────────────────────
function formatDateWithTooltip(d) {
  if (!d) return 'N/A';
  const date = new Date(d);
  const short = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const full = date.toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  return `<span class="date-tooltip" data-full="${full}">${short}</span>`;
}

window.addEventListener('popstate', () => {
  if (!window.location.pathname.startsWith('/admin')) return;
  const pathParts = window.location.pathname.replace('/admin/', '').split('/');
  const basePage = pathParts[0] || 'login';
  const param = pathParts[1] || null;

  if (!adminState.token) {
    renderAdminLogin();
    return;
  }

  if (basePage === 'server' && param) {
    const pid = parseInt(param, 10);
    $a('#admin-page-server-detail')?.classList.add('active');
    $a('#admin-page-servers')?.classList.remove('active');
    renderAdminServerDetail(pid);
    const tab = pathParts[2];
    if (tab) {
      setTimeout(() => {
        const tabBtn = document.querySelector('#admin-server-tabs .tab[data-tab="' + tab + '"]');
        if (tabBtn) tabBtn.click();
      }, 50);
    }
  } else if (basePage === 'user' && param) {
    const uid = parseInt(param, 10);
    $a('#admin-page-user-detail')?.classList.add('active');
    renderAdminUserDetail(uid);
    const tab = pathParts[2];
    if (tab) {
      setTimeout(() => {
        const tabBtn = document.querySelector('#admin-user-tabs .tab[data-tab="' + tab + '"]');
        if (tabBtn) tabBtn.click();
      }, 50);
    }
  } else if (basePage === 'node' && param) {
    const nid = parseInt(param, 10);
    $a('#admin-page-node-detail')?.classList.add('active');
    renderAdminNodeDetail(nid);
    const tab = pathParts[2];
    if (tab) {
      setTimeout(() => {
        const tabBtn = document.querySelector('#admin-node-tabs .tab[data-tab="' + tab + '"]');
        if (tabBtn) tabBtn.click();
      }, 50);
    }
  } else if (basePage === 'nodes') {
    adminNavigateTo('nodes');
  } else if (basePage === 'users') {
    adminNavigateTo('users');
  } else if (basePage === 'dashboard' || !basePage || basePage === 'login') {
    adminNavigateTo('dashboard');
    return;
  } else if (basePage === 'settings') {
    adminNavigateTo(pathParts.join('/'));
  } else {
    adminNavigateTo('servers');
  }
});

let adminTakingOver = false;

function initAdmin() {
  const path = window.location.pathname;
  if (!path.startsWith('/admin')) return;

  adminTakingOver = true;

  // Clear any dashboard that may have been rendered by an old cached app.js
  const app = document.getElementById('app');
  if (app && app.querySelector('.dashboard-layout')) {
    app.innerHTML = '';
    localStorage.removeItem('zh_token');
    localStorage.removeItem('zh_user');
  }

  let meta = document.querySelector('meta[name="robots"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
  }

  // Render a loading state immediately so the user never sees a blank screen
  if (app) {
    app.innerHTML = '<div class="auth-page"><div class="auth-card" style="text-align:center;padding:48px"><span class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto 16px"></span><p style="color:var(--text-secondary)">Loading admin panel...</p></div></div>';
  }

  const token = localStorage.getItem(ADMIN_STORAGE_KEY);
  if (token) {
    adminState.token = token;
    adminApi('/check').then((data) => {
      adminState.user = data.user;
      const pathParts = path.replace('/admin/', '').split('/');
      const basePage = pathParts[0] || '';
      const param = pathParts[1] || null;

      if (basePage === 'login' || !basePage) {
        adminNavigateTo('dashboard');
      } else if (basePage === 'server' && param) {
        renderAdminLayout();
      } else if (basePage === 'user' && param) {
        renderAdminLayout();
      } else if (basePage === 'settings') {
        renderAdminLayout();
      } else {
        renderAdminLayout();
      }
    }).catch(() => {
      adminState.token = null;
      localStorage.removeItem(ADMIN_STORAGE_KEY);
      renderAdminLogin();
    });
  } else {
    renderAdminLogin();
  }
}

initAdmin();
