const ADMIN_STORAGE_KEY = 'zh_admin_token';

const adminState = {
  token: localStorage.getItem(ADMIN_STORAGE_KEY),
  user: null,
  currentPage: 'servers',
  serverId: null,
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

  if (basePage === 'server' && adminState.serverId) {
    renderAdminServerDetail(adminState.serverId);
    history.pushState({ adminPage: 'server', serverId: adminState.serverId }, '', `/admin/server/${adminState.serverId}`);
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
    const data = await adminApi('/login', {
      method: 'POST',
      body: JSON.stringify({
        email: $a('#admin-email').value,
        password: $a('#admin-password').value,
      }),
    });
    adminState.token = data.token;
    adminState.user = data.user;
    localStorage.setItem(ADMIN_STORAGE_KEY, data.token);
    history.replaceState({ adminPage: 'servers' }, '', '/admin/servers');
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
          <a class="admin-nav-link active" data-page="servers" href="/admin/servers">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="6" cy="18" r="1" fill="currentColor"/></svg>
            Servers
          </a>
        </div>
        <div class="admin-navbar-right">
          <span class="admin-navbar-user">${adminState.user?.username || 'Admin'}</span>
          <button class="btn btn-ghost btn-sm" id="admin-logout-btn" style="width:auto">Logout</button>
        </div>
      </nav>
      <main class="admin-content">
        <div class="admin-page active" id="admin-page-servers"></div>
        <div class="admin-page" id="admin-page-server-detail"></div>
      </main>
    </div>
  `;

  $a('#admin-logout-btn').addEventListener('click', async () => {
    adminState.token = null;
    adminState.user = null;
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    adminNavigateTo('login');
  });

  $a('.admin-nav-link').addEventListener('click', (e) => {
    e.preventDefault();
    adminNavigateTo('servers');
  });

  updateAdminNav();

  const path = window.location.pathname.replace('/admin/', '').split('/');
  const basePage = path[0] || 'servers';
  const param = path[1] || null;
  if (basePage === 'server' && param) {
    const pid = parseInt(param, 10);
    adminState.currentPage = 'server';
    adminState.serverId = pid;
    $a('#admin-page-server-detail').classList.add('active');
    $a('#admin-page-servers').classList.remove('active');
    renderAdminServerDetail(pid);
  } else {
    adminState.currentPage = 'servers';
    renderAdminServers();
  }
}

function updateAdminNav() {
  const link = $a('.admin-nav-link');
  if (link) {
    link.classList.toggle('active', adminState.currentPage === 'servers');
  }
}

async function renderAdminServers() {
  const el = $a('#admin-page-servers');
  if (!el) return;
  el.classList.add('active');
  const detailPage = $a('#admin-page-server-detail');
  if (detailPage) detailPage.classList.remove('active');
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
  const detailPage = $a('#admin-page-server-detail');
  const listPage = $a('#admin-page-servers');
  if (!detailPage) return;
  if (listPage) listPage.classList.remove('active');
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
                <div class="detail-item"><span class="detail-label">Created</span><span class="detail-value">${formatDate(meta.created_at)}</span></div>
                <div class="detail-item"><span class="detail-label">Expires</span><span class="detail-value">${formatDate(meta.expires_at)}</span></div>
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
        <div class="card" style="margin-bottom:16px">
          <h2 class="card-title" style="margin-bottom:16px">Suspend</h2>
          <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:12px">
            Suspend this server. The user will see the reason on their dashboard and cannot renew until unsuspended.
          </p>
          <div class="form-group">
            <label for="admin-suspend-reason">Reason (optional)</label>
            <textarea id="admin-suspend-reason" rows="2" placeholder="Enter reason for suspension..." style="resize:vertical;width:100%;padding:10px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;font-size:0.88rem"></textarea>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-danger" id="admin-btn-suspend" style="width:auto">${isSuspended ? 'Re-suspend' : 'Suspend'}</button>
            ${isSuspended ? ahtml`<button class="btn btn-primary" id="admin-btn-unsuspend" style="width:auto">Unsuspend</button>` : ''}
            <button class="btn btn-warning" id="admin-btn-stop" style="width:auto">Stop</button>
            ${!isSuspended ? ahtml`<button class="btn btn-ghost" id="admin-btn-renew-now" style="width:auto">Renew Now</button>` : ''}
          </div>
          <div id="admin-action-msg" style="margin-top:12px;display:none"></div>
        </div>

        <div class="card">
          <h2 class="card-title" style="margin-bottom:16px">Danger Zone</h2>
          <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:12px">
            Irreversible actions.
          </p>
          <button class="btn btn-danger" id="admin-btn-delete" style="width:auto">Delete Server</button>
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

  $a('#admin-btn-suspend')?.addEventListener('click', async () => {
    const btn = $a('#admin-btn-suspend');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Suspending...';
    clearMsg();
    try {
      const reason = $a('#admin-suspend-reason')?.value?.trim() || '';
      await adminApi(`/servers/${serverId}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || undefined }),
      });
      showMsg('Server suspended successfully');
      setTimeout(() => renderAdminServerDetail(serverId), 1500);
    } catch (err) {
      showMsg(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Suspend';
    }
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

  $a('#admin-btn-renew-now')?.addEventListener('click', async () => {
    const btn = $a('#admin-btn-renew-now');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Expiring...';
    clearMsg();
    try {
      await adminApi(`/servers/${serverId}/renew-now`, {
        method: 'POST',
      });
      showMsg('Server has been expired. The user can renew to reactivate it.');
      setTimeout(() => renderAdminServerDetail(serverId), 1500);
    } catch (err) {
      showMsg(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Renew Now';
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

function formatDate(d) {
  if (!d) return 'N/A';
  const date = new Date(d);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
  } else if (basePage === 'servers' || !basePage || basePage === 'login') {
    renderAdminServers();
  } else {
    renderAdminServers();
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
        adminNavigateTo('servers');
      } else if (basePage === 'server' && param) {
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
