import { PTERO_URL, PTERO_API_KEY, SERVER_LIMITS, FEATURE_LIMITS, DEPLOY_LOCATIONS, PANEL_DB_NAME } from '../config/pyrodactyl.js';

export { PANEL_DB_NAME };

const FETCH_TIMEOUT = 15000;
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 50;
const nodeCache = new Map();
let cacheCleanupTimer = null;

function recordPteroError(errMsg) {
  console.warn(`Pterodactyl API error: ${errMsg}`);
}

async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

const headers = {
  'Authorization': `Bearer ${PTERO_API_KEY}`,
  'Accept': 'application/json',
  'Content-Type': 'application/json',
};

function startCacheCleanup() {
  if (cacheCleanupTimer) return;
  cacheCleanupTimer = setInterval(() => {
    const cutoff = Date.now() - CACHE_TTL;
    let cleaned = 0;
    for (const [id, entry] of nodeCache) {
      if (entry.ts < cutoff) {
        nodeCache.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`Cleaned ${cleaned} stale cache entries (${nodeCache.size} remaining)`);
    }
  }, CACHE_TTL);
}

startCacheCleanup();

async function pteroFetch(path, options = {}) {
  const url = `${PTERO_URL}/api/application${path}`;
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let res;
    try {
      res = await fetchWithTimeout(url, {
        ...options,
        headers: { ...headers, ...options.headers },
      });
    } catch (err) {
      recordPteroError(err.message);
      if (attempt < maxRetries) {
        const wait = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        console.warn(`pteroFetch network error (${err.message}), retry ${attempt}/${maxRetries} after ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
    if (res.status === 204) return null;
    if (res.status === 429 && attempt < maxRetries) {
      const wait = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.warn(`pteroFetch rate limited (429), retry ${attempt}/${maxRetries} after ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      recordPteroError(`${res.status} ${res.statusText}`);
      const text = await res.text();
      throw new Error(`Pterodactyl API error ${res.status}: ${text.slice(0, 200)}`);
    }
    return await res.json();
  }
}

export async function createPteroUser({ email, username, firstName, lastName, password }) {
  const data = await pteroFetch('/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      username,
      first_name: firstName,
      last_name: lastName,
      password,
      language: 'en',
      root_admin: false,
    }),
  });
  return data.attributes;
}

export async function getPteroUserById(id) {
  const data = await pteroFetch(`/users/${id}`);
  return data.attributes;
}

async function getNode(nodeId) {
  if (nodeCache.has(nodeId)) {
    const cached = nodeCache.get(nodeId);
    if (Date.now() - cached.ts < CACHE_TTL) return cached.data;
  }
  const data = await pteroFetch(`/nodes/${nodeId}`);
  const node = data.attributes;
  if (nodeCache.size >= CACHE_MAX_SIZE) {
    const oldest = nodeCache.keys().next().value;
    nodeCache.delete(oldest);
  }
  nodeCache.set(nodeId, { data: node, ts: Date.now() });
  if (nodeCache.size % 10 === 0) {
    const cutoff = Date.now() - CACHE_TTL;
    for (const [id, entry] of nodeCache) {
      if (entry.ts < cutoff) nodeCache.delete(id);
    }
  }
  return node;
}

export async function getEgg(nestId, eggId) {
  const data = await pteroFetch(`/nests/${nestId}/eggs/${eggId}`);
  return data.attributes;
}

export async function getPteroNests() {
  const data = await pteroFetch('/nests?per_page=100');
  return data.data.map(n => n.attributes);
}

export async function getPteroNestEggs(nestId) {
  const data = await pteroFetch(`/nests/${nestId}/eggs?per_page=100`);
  return data.data.map(e => e.attributes);
}

export async function getAllServers() {
  let allServers = [];
  let page = 1;
  let hasMore = true;

  const MAX_PAGES = 20;
  while (hasMore && page <= MAX_PAGES) {
    const data = await pteroFetch(`/servers?page=${page}&per_page=50`);
    const servers = data.data.map(s => s.attributes);
    allServers = allServers.concat(servers);
    if (data.meta?.pagination?.total_pages > page) {
      page++;
    } else {
      hasMore = false;
    }
  }

  for (const server of allServers) {
    try {
      const node = await getNode(server.node);
      server.nodeFqdn = node.fqdn;
    } catch { server.nodeFqdn = null; }
    try {
      const allocData = await pteroFetch(`/nodes/${server.node}/allocations/${server.allocation}`);
      server.allocationDetails = allocData.attributes;
      server.allocationDetails.nodeFqdn = server.nodeFqdn;
    } catch { server.allocationDetails = null; }
    try {
      const eggData = await pteroFetch(`/nests/${server.nest}/eggs/${server.egg}`);
      server.eggDetails = { name: eggData.attributes.name };
    } catch { server.eggDetails = null; }
  }

  return allServers;
}

export async function getServersByUser(userId) {
  let allServers = [];
  let page = 1;
  let hasMore = true;

  const MAX_PAGES = 20;
  while (hasMore && page <= MAX_PAGES) {
    const data = await pteroFetch(`/servers?page=${page}&per_page=50`);
    const servers = data.data.map(s => s.attributes).filter(s => s.user === userId);
    allServers = allServers.concat(servers);
    if (data.meta?.pagination?.total_pages > page) {
      page++;
    } else {
      hasMore = false;
    }
  }

  for (const server of allServers) {
    try {
      const node = await getNode(server.node);
      server.nodeFqdn = node.fqdn;
    } catch {
      server.nodeFqdn = null;
    }
    try {
      const allocData = await pteroFetch(`/nodes/${server.node}/allocations/${server.allocation}`);
      server.allocationDetails = allocData.attributes;
      server.allocationDetails.nodeFqdn = server.nodeFqdn;
    } catch {
      server.allocationDetails = null;
    }
    try {
      const eggData = await pteroFetch(`/nests/${server.nest}/eggs/${server.egg}`);
      server.eggDetails = { name: eggData.attributes.name };
    } catch {
      server.eggDetails = null;
    }
  }

  return allServers;
}

export async function getServerById(serverId) {
  const data = await pteroFetch(`/servers/${serverId}`);
  const server = data.attributes;

  try {
    const node = await getNode(server.node);
    server.nodeFqdn = node.fqdn;
  } catch {
    server.nodeFqdn = null;
  }

  if (server.allocation) {
    try {
      const allocData = await pteroFetch(`/nodes/${server.node}/allocations/${server.allocation}`);
      server.allocationDetails = allocData.attributes;
      server.allocationDetails.nodeFqdn = server.nodeFqdn;
    } catch {
      server.allocationDetails = null;
    }
  }

  return server;
}

export async function createPteroServer({ name, userId, eggId, nestId, environment, startup, dockerImage, customLimits, deployLocations }) {
  const limits = { ...SERVER_LIMITS, ...customLimits };
  const body = {
    name,
    user: userId,
    egg: eggId,
    docker_image: dockerImage,
    startup,
    environment,
    limits,
    feature_limits: FEATURE_LIMITS,
    deploy: {
      locations: deployLocations || DEPLOY_LOCATIONS,
      dedicated_ip: false,
      port_range: [],
    },
    start_on_completion: true,
    skip_scripts: false,
    oom_disabled: true,
  };

  const data = await pteroFetch('/servers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.attributes;
}

export async function deletePteroServer(serverId) {
  await pteroFetch(`/servers/${serverId}`, {
    method: 'DELETE',
  });
}

export async function suspendPteroServer(serverId) {
  await pteroFetch(`/servers/${serverId}/suspend`, {
    method: 'POST',
  });
}

export async function unsuspendPteroServer(serverId) {
  await pteroFetch(`/servers/${serverId}/unsuspend`, {
    method: 'POST',
  });
}

export async function reinstallPteroServer(serverId) {
  await pteroFetch(`/servers/${serverId}/reinstall`, {
    method: 'POST',
  });
}

export async function updatePteroServerBuild(serverId, limits) {
  // Fetch current server to get all required fields
  const server = await getServerById(serverId);
  const currentLimits = server.limits || {};
  const mergedLimits = { ...currentLimits, ...limits };
  await pteroFetch(`/servers/${serverId}/build`, {
    method: 'PATCH',
    body: JSON.stringify({
      allocation: server.allocation,
      ...mergedLimits,
      feature_limits: server.feature_limits || { databases: 0, allocations: 1, backups: 1 },
      oom_disabled: server.oom_disabled ?? true,
    }),
  });
}

export async function getPergoServerIdsByEgg(nestId, eggId) {
  const ids = [];
  let page = 1;
  let hasMore = true;
  const MAX_PAGES = 20;
  while (hasMore && page <= MAX_PAGES) {
    const data = await pteroFetch(`/servers?page=${page}&per_page=100`);
    const servers = data.data.map(s => s.attributes);
    for (const s of servers) {
      if (s.nest === nestId && s.egg === eggId) {
        ids.push(s.id);
      }
    }
    if (data.meta?.pagination?.total_pages > page) {
      page++;
    } else {
      hasMore = false;
    }
  }
  return ids;
}

export async function renamePteroServer(serverId, name) {
  const server = await getServerById(serverId);
  await pteroFetch(`/servers/${serverId}/details`, {
    method: 'PATCH',
    body: JSON.stringify({
      name,
      user: server.user,
    }),
  });
}

export async function updatePteroPassword(userId, password) {
  await pteroFetch(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ password }),
  });
}

export async function updatePteroEmail(userId, email) {
  // Pyrodactyl requires all required fields on PATCH
  const user = await getPteroUserById(userId);
  await pteroFetch(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      email,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
    }),
  });
}

export async function deletePteroUser(userId) {
  await pteroFetch(`/users/${userId}`, { method: 'DELETE' });
}

export async function getAllNodes() {
  let allNodes = [];
  let page = 1;
  let hasMore = true;
  const MAX_PAGES = 20;
  while (hasMore && page <= MAX_PAGES) {
    const data = await pteroFetch(`/nodes?page=${page}&per_page=50`);
    const nodes = data.data.map(n => n.attributes);
    allNodes = allNodes.concat(nodes);
    if (data.meta?.pagination?.total_pages > page) {
      page++;
    } else {
      hasMore = false;
    }
  }
  return allNodes;
}

export async function getNodeDetail(nodeId) {
  const data = await pteroFetch(`/nodes/${nodeId}`);
  return data.attributes;
}

export async function getNodeAllocations(nodeId) {
  let allAllocs = [];
  let page = 1;
  let hasMore = true;
  const MAX_PAGES = 20;
  while (hasMore && page <= MAX_PAGES) {
    const data = await pteroFetch(`/nodes/${nodeId}/allocations?page=${page}&per_page=100`);
    const allocs = data.data.map(a => a.attributes);
    allAllocs = allAllocs.concat(allocs);
    if (data.meta?.pagination?.total_pages > page) {
      page++;
    } else {
      hasMore = false;
    }
  }
  return allAllocs;
}

export async function getNodeServers(nodeId) {
  let allServers = [];
  let page = 1;
  let hasMore = true;
  const MAX_PAGES = 20;
  while (hasMore && page <= MAX_PAGES) {
    const data = await pteroFetch(`/nodes/${nodeId}/servers?page=${page}&per_page=50`);
    const servers = data.data.map(s => s.attributes);
    allServers = allServers.concat(servers);
    if (data.meta?.pagination?.total_pages > page) {
      page++;
    } else {
      hasMore = false;
    }
  }
  return allServers;
}

export async function getAllEggs(nestIds = []) {
  const eggs = [];

  for (const nestId of nestIds) {
    try {
      const nestData = await pteroFetch(`/nests/${nestId}/eggs?per_page=100`);
      for (const e of nestData.data) {
        try {
          const full = await getEgg(nestId, e.attributes.id);
          eggs.push({ nest: nestId, egg: full });
        } catch (err) {
          console.error(`Failed to fetch egg ${e.attributes.id} from nest ${nestId}:`, err.message);
        }
      }
    } catch (err) {
      console.error(`Failed to fetch nest ${nestId}:`, err.message);
    }
  }

  return eggs;
}
