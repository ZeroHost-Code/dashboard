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
  updateAdminNav();

  if (basePage === 'server' && adminState.serverId) {
    renderAdminServerDetail(adminState.serverId);
    history.pushState({ adminPage: 'server', serverId: adminState.serverId }, '', `/admin/server/${adminState.serverId}`);
  } else if (basePage === 'user' && adminState.userId) {
    renderAdminUserDetail(adminState.userId);
    history.pushState({ adminPage: 'user', userId: adminState.userId }, '', `/admin/user/${adminState.userId}`);
  } else if (basePage === 'users') {
    renderAdminUsers();
    history.pushState({ adminPage: 'users' }, '', '/admin/users');
  } else if (basePage === 'dashboard') {
    renderAdminDashboard();
    history.pushState({ adminPage: 'dashboard' }, '', '/admin/dashboard');
  } else if (basePage === 'activity') {
    renderAdminActivity();
    history.pushState({ adminPage: 'activity' }, '', '/admin/activity');
  } else if (basePage === 'settings') {
    renderAdminSettings();
    history.pushState({ adminPage: 'settings' }, '', '/admin/settings');
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
          <img src="https://status.zero-host.org/upload/logo1.png?t=1781280015614" alt="ZeroHost" />
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
            <img src="https://status.zero-host.org/upload/logo1.png?t=1781280015614" alt="ZeroHost" />
            <span class="sidebar-logo-text">Zero<span style="color:var(--accent-3)">Host</span></span>
          </a>
          <span class="admin-badge">Admin</span>
        </div>
        <div class="admin-navbar-center">
          <a class="admin-nav-link" data-page="dashboard" href="/admin/dashboard">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Dashboard
          </a>
          <a class="admin-nav-link" data-page="servers" href="/admin/servers">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="6" cy="18" r="1" fill="currentColor"/></svg>
            Servers
          </a>
          <a class="admin-nav-link" data-page="users" href="/admin/users">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Users
          </a>
          <a class="admin-nav-link" data-page="activity" href="/admin/activity">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            Activity
          </a>
          <a class="admin-nav-link" data-page="settings" href="/admin/settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
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
        <div class="admin-page" id="admin-page-users"></div>
        <div class="admin-page" id="admin-page-user-detail"></div>
        <div class="admin-page" id="admin-page-activity"></div>
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
      adminNavigateTo(page);
    });
  });

  initAdminDateTooltip();

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
  } else if (basePage === 'users') {
    adminState.currentPage = 'users';
    updateAdminNav();
    renderAdminUsers();
  } else if (basePage === 'dashboard' || !basePage) {
    adminState.currentPage = 'dashboard';
    updateAdminNav();
    renderAdminDashboard();
  } else if (basePage === 'activity') {
    adminState.currentPage = 'activity';
    updateAdminNav();
    renderAdminActivity();
  } else if (basePage === 'settings') {
    adminState.currentPage = 'settings';
    updateAdminNav();
    renderAdminSettings();
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
            <th>Allocation</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="admin-servers-tbody">
          <tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-secondary)"><span class="spinner"></span> Loading...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  try {
    const data = await adminApi('/servers');
    const tbody = $a('#admin-servers-tbody');
    if (!tbody) return;

    if (data.servers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-secondary)">No servers found.</td></tr>';
      return;
    }

    tbody.innerHTML = data.servers.map(s => {
      const eggName = s.eggDetails?.name || `Egg #${s.egg}`;
      const alloc = s.allocationDetails;
      const allocStr = alloc ? `${alloc.alias || alloc.nodeFqdn || alloc.ip}:${alloc.port}` : (s.nodeFqdn || `Node #${s.node}`);
      const isInstalling = s.status === 'installing' || s.installed === 0 || s.installed === '0' || s.installed === false;
      const isSuspended = s.status === 'suspended';
      const statusClass = isSuspended ? 'status-suspended' : (isInstalling ? 'status-installing' : 'status-active');
      const statusLabel = isSuspended ? 'Suspended' : (isInstalling ? 'Installing' : 'Active');
      const ownerName = s.owner?.username || 'Unknown';

      return ahtml`
        <tr>
          <td><strong>${s.name}</strong></td>
          <td>${ownerName}</td>
          <td><span class="server-detail-tag">${eggName}</span></td>
          <td><span class="server-detail-tag">${allocStr}</span></td>
          <td><span class="server-card-status ${statusClass}">${statusLabel}</span></td>
          <td>
            <a class="btn btn-ghost btn-sm" href="/admin/server/${s.id}" onclick="event.preventDefault();adminNavigateTo('server/${s.id}')">Details</a>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    const tbody = $a('#admin-servers-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--accent-red)">Error: ${err.message}</td></tr>`;
  }
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Servers
        </a>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <h1 class="page-title" style="margin-bottom:0">${s.name}</h1>
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
              <div class="detail-item"><span class="detail-label">Egg</span><span class="detail-value">${eggName}</span></div>
              <div class="detail-item"><span class="detail-label">Allocation</span><span class="detail-value">${allocStr}</span></div>
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

    initAdminTabs();
    initAdminActions(serverId);
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

function initAdminTabs() {
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
  }

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      switchTab(btn);
    });
  });

  // Set initial indicator position
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
        <td>${u.id}</td>
        <td><strong>${u.username}</strong></td>
        <td>${u.email}</td>
        <td>${u.is_admin ? '<span class="server-card-status status-active" style="font-size:0.75rem">Admin</span>' : '<span class="server-card-status status-installing" style="font-size:0.75rem">User</span>'}</td>
        <td>${u.server_count}</td>
        <td>${formatDateWithTooltip(u.created_at)}</td>
        <td>
          <a class="btn btn-ghost btn-sm" href="/admin/user/${u.id}" onclick="event.preventDefault();adminNavigateTo('user/${u.id}')">Details</a>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    const tbody = $a('#admin-users-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--accent-red)">Error: ${err.message}</td></tr>`;
  }
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Users
        </a>
        <h1 class="page-title" style="margin-bottom:0">${u.username}</h1>
      </div>

      <div class="server-detail-grid" style="margin-bottom:24px">
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
        <div style="display:flex;flex-direction:column;gap:20px">
          <div class="card">
            <h2 class="card-title" style="margin-bottom:16px">IP Addresses</h2>
            ${data.ips && data.ips.length > 0 ? ahtml`
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                ${data.ips.map(ip => ahtml`<span class="server-detail-tag" style="font-family:monospace">${ip.ip_address}</span>`).join('')}
              </div>
            ` : '<p style="color:var(--text-secondary)">No IPs recorded.</p>'}
          </div>
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
            <h2 class="card-title" style="margin-bottom:16px;color:var(--accent-red)">Danger Zone</h2>
            <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:12px">
              Toggle admin privileges or delete this user.
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn ${u.is_admin ? 'btn-warning' : 'btn-primary'}" id="admin-btn-toggle-admin" style="width:auto">${u.is_admin ? 'Remove Admin' : 'Make Admin'}</button>
              <button class="btn btn-danger" id="admin-btn-delete-user" style="width:auto">Delete User</button>
            </div>
            <div id="admin-user-action-msg" style="margin-top:12px;display:none"></div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:24px">
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
                    <td><strong>${s.server_name || 'Unknown'}</strong></td>
                    <td><span class="server-card-status ${s.status === 'active' ? 'status-active' : s.status === 'suspended' ? 'status-suspended' : 'status-installing'}" style="font-size:0.75rem;text-transform:capitalize">${s.status}</span></td>
                    <td>${formatDateWithTooltip(s.created_at)}</td>
                    <td>${formatDateWithTooltip(s.expires_at)}</td>
                    <td style="display:flex;gap:6px">
                      <a class="btn btn-ghost btn-sm" href="/admin/server/${s.ptero_server_id}" onclick="event.preventDefault();adminNavigateTo('server/${s.ptero_server_id}')">Manage</a>
                      <button class="btn btn-ghost btn-sm" onclick="window.open('${PTERO_URL}/server/${s.server_uuid}', '_blank')">Open Pyrodactyl</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<p style="color:var(--text-secondary)">No servers.</p>'}
      </div>
    `;

    initUserActions(userId);
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

// ─── Activity Log ───────────────────────────────────────
async function renderAdminActivity() {
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  const el = $a('#admin-page-activity');
  if (!el) return;
  el.classList.add('active');

  el.innerHTML = ahtml`
    <div class="page-header">
      <h1 class="page-title">Activity Log</h1>
      <p class="page-subtitle">All platform activity</p>
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>User</th>
            <th>Action</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody id="admin-activity-tbody">
          <tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-secondary)"><span class="spinner"></span> Loading...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  try {
    const data = await adminApi('/activity');
    const tbody = $a('#admin-activity-tbody');
    if (!tbody) return;

    if (data.activities.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-secondary)">No activity found.</td></tr>';
      return;
    }

    tbody.innerHTML = data.activities.map(a => ahtml`
      <tr>
        <td style="white-space:nowrap;font-size:0.82rem;color:var(--text-secondary)">${formatDateWithTooltip(a.created_at)}</td>
        <td>${a.username || 'Unknown'}</td>
        <td><span class="server-detail-tag">${a.action}</span></td>
        <td style="color:var(--text-secondary);font-size:0.85rem">${a.details || ''}</td>
      </tr>
    `).join('');
  } catch (err) {
    const tbody = $a('#admin-activity-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--accent-red)">Error: ${err.message}</td></tr>`;
  }
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
    <div class="empty-state">
      <div class="empty-state-title">Soon</div>
      <div class="empty-state-desc">Settings are coming in a future update.</div>
    </div>
  `;
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
  } else if (basePage === 'user' && param) {
    const uid = parseInt(param, 10);
    $a('#admin-page-user-detail')?.classList.add('active');
    renderAdminUserDetail(uid);
  } else if (basePage === 'users') {
    adminNavigateTo('users');
  } else if (basePage === 'dashboard' || !basePage || basePage === 'login') {
    adminNavigateTo('dashboard');
  } else if (basePage === 'activity') {
    adminNavigateTo('activity');
  } else if (basePage === 'settings') {
    adminNavigateTo('settings');
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
