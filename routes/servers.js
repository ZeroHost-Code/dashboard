import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken, requireNotRestricted, requireOwnership } from '../middleware/auth.js';
import {
  getServersByUser,
  getServerById,
  createPteroServer,
  deletePteroServer,
  reinstallPteroServer,
  renamePteroServer,
  unsuspendPteroServer,
  getEgg,
  getAllEggs,
  getAllNodes,
} from '../services/pyrodactyl.js';
import { PTERO_URL, PANEL_DB_NAME } from '../config/pyrodactyl.js';
import { query } from '../config/db.js';
import { verifyCap } from '../config/cap.js';
import { logActivity } from '../services/activity.js';
import { createNotification } from '../services/notification.js';

const router = Router();

const createServerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Server creation limit reached. Max 3 per hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const renameLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many rename requests. Max 10 per hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const renewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many renew requests. Max 5 per hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const reinstallLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 2,
  message: { error: 'Too many reinstall requests. Max 2 per day.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const powerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many power actions. Max 20 per minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/list', authenticateToken, async (req, res) => {
  try {
    const pteroId = req.user.pteroId;
    let servers = [];
    try {
      servers = await getServersByUser(pteroId);
    } catch (err) {
      console.error('List servers Pyrodactyl error:', err.message);
      return res.json({ servers: [], pteroError: 'Pyrodactyl panel is currently unreachable.' });
    }

    for (const s of servers) {
      try {
        const meta = await query('SELECT * FROM server_meta WHERE ptero_server_id = ?', [s.id]);
        s.serverMeta = meta.length > 0 ? meta[0] : null;
      } catch {
        s.serverMeta = null;
      }
    }

    // Fetch live power state from Pyrodactyl Client API
    const userRows = await query('SELECT ptero_client_api_key FROM users WHERE id = ?', [req.user.userId]);
    const clientApiKey = userRows[0]?.ptero_client_api_key;

    if (clientApiKey) {
      await Promise.all(servers.map(async (server) => {
        try {
          const pteroRes = await fetch(`${PTERO_URL}/api/client/servers/${server.identifier}/resources`, {
            headers: {
              'Authorization': `Bearer ${clientApiKey}`,
              'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(8000),
          });
          if (pteroRes.ok) {
            const data = await pteroRes.json();
            server.currentState = data.attributes.current_state;
          } else {
            server.currentState = null;
          }
        } catch {
          server.currentState = null;
        }
      }));
    } else {
      servers.forEach(s => s.currentState = null);
    }

    res.json({ servers });
  } catch (err) {
    console.error('List servers error:', err.message);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

router.get('/nests', authenticateToken, async (req, res) => {
  try {
    const dbNests = await query('SELECT ptero_nest_id, name, logo, description, unavailable FROM nests');
    const nestIds = dbNests.map(n => n.ptero_nest_id);

    const eggs = await getAllEggs(nestIds);
    const nestMap = {};
    for (const n of dbNests) {
      nestMap[n.ptero_nest_id] = n;
    }

    const eggResources = await query('SELECT ptero_nest_id, ptero_egg_id, logo, cpu_limit, memory_limit, disk_limit, unavailable FROM egg_resources');
    const eggResMap = {};
    for (const r of eggResources) {
      eggResMap[`${r.ptero_nest_id}-${r.ptero_egg_id}`] = r;
    }

    const result = [];
    const nestEggs = {};
    for (const { nest, egg } of eggs) {
      if (!nestEggs[nest]) nestEggs[nest] = [];
      const key = `${nest}-${egg.id}`;
      const res = eggResMap[key] || {};
      nestEggs[nest].push({
        eggId: egg.id,
        name: egg.name,
        description: egg.description || '',
        dockerImages: egg.docker_images || {},
        logo: res.logo || null,
        cpu_limit: res.cpu_limit ?? null,
        memory_limit: res.memory_limit ?? null,
        disk_limit: res.disk_limit ?? null,
        unavailable: !!res.unavailable,
      });
    }

    for (const n of dbNests) {
      result.push({
        pteroNestId: n.ptero_nest_id,
        name: n.name,
        logo: n.logo || null,
        description: n.description || '',
        unavailable: !!n.unavailable,
        eggs: nestEggs[n.ptero_nest_id] || [],
      });
    }

    res.json({ nests: result });
  } catch (err) {
    console.error('Get nests error:', err.message);
    res.status(500).json({ error: 'Failed to fetch nests' });
  }
});

router.get('/eggs', authenticateToken, async (req, res) => {
  try {
    const dbNests = await query('SELECT ptero_nest_id, name FROM nests');
    const nestMap = {};
    for (const n of dbNests) {
      nestMap[n.ptero_nest_id] = n.name;
    }
    const nestIds = dbNests.map(n => n.ptero_nest_id);

    const eggs = await getAllEggs(nestIds);
    const simplified = [];

    for (const { nest, egg } of eggs) {
      simplified.push({
        nestId: nest,
        nestName: nestMap[nest] || `Nest ${nest}`,
        eggId: egg.id,
        name: egg.name,
        description: egg.description,
        startup: egg.startup,
        dockerImages: egg.docker_images,
        configStop: egg.config?.stop || '^^C',
        configStartup: egg.config?.startup || null,
        variables: [],
      });
    }
    res.json({ eggs: simplified });
  } catch (err) {
    console.error('Get eggs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch eggs' });
  }
});

router.post('/create', authenticateToken, requireNotRestricted, createServerLimiter, async (req, res) => {
  try {
    const { name, nestId, eggId, environment, capToken, dockerImage: reqDockerImage } = req.body;
    const pteroId = req.user.pteroId;

    if (typeof name !== 'string') {
      return res.status(400).json({ error: 'Server name must be a string' });
    }

    if (!name || !nestId || !eggId) {
      return res.status(400).json({ error: 'Name, nest ID and egg ID are required' });
    }

    if (name.length < 1 || name.length > 255) {
      return res.status(400).json({ error: 'Server name must be between 1 and 255 characters' });
    }

    if (!/^[a-zA-Z0-9 _.-]+$/.test(name)) {
      return res.status(400).json({ error: 'Server name contains invalid characters' });
    }

    if (!await verifyCap(capToken)) {
      return res.status(400).json({ error: 'Please complete the security check' });
    }

    // Check if nest or egg is unavailable
    try {
      const [nestRow] = await query('SELECT unavailable FROM nests WHERE ptero_nest_id = ?', [nestId]);
      if (nestRow && nestRow.unavailable) {
        return res.status(403).json({ error: 'This nest is currently unavailable' });
      }
      const [eggRow] = await query('SELECT unavailable FROM egg_resources WHERE ptero_nest_id = ? AND ptero_egg_id = ?', [nestId, eggId]);
      if (eggRow && eggRow.unavailable) {
        return res.status(403).json({ error: 'This egg is currently unavailable' });
      }
    } catch (err) {
      console.warn('Failed to check nest/egg availability:', err.message);
    }

    const existingServers = await getServersByUser(pteroId);
    if (existingServers.length >= 3) {
      return res.status(403).json({ error: 'Server limit reached. You can only create up to 3 servers.' });
    }

    const egg = await getEgg(nestId, eggId);
    let dockerImage;
    if (reqDockerImage && egg.docker_images) {
      if (egg.docker_images[reqDockerImage]) {
        dockerImage = egg.docker_images[reqDockerImage];
      } else {
        dockerImage = reqDockerImage;
      }
    } else {
      dockerImage = Object.values(egg.docker_images || {})[0] || Object.keys(egg.docker_images || {})[0];
    }

    const eggVars = await query(`SELECT env_variable, default_value FROM ${PANEL_DB_NAME}.egg_variables WHERE egg_id = ?`, [eggId]);

    const mergedEnv = {};
    for (const v of eggVars) {
      mergedEnv[v.env_variable] = v.default_value ?? '';
    }

    // Check for per-egg custom resource overrides
    const [eggRes] = await query('SELECT * FROM egg_resources WHERE ptero_nest_id = ? AND ptero_egg_id = ?', [nestId, eggId]);
    const customLimits = {};
    if (eggRes) {
      if (eggRes.cpu_limit != null) customLimits.cpu = eggRes.cpu_limit;
      if (eggRes.memory_limit != null) customLimits.memory = eggRes.memory_limit;
      if (eggRes.disk_limit != null) customLimits.disk = eggRes.disk_limit;
    }

    // Filter out unavailable nodes
    let deployLocations;
    try {
      const unavailableRows = await query('SELECT ptero_node_id FROM node_settings WHERE unavailable = 1');
      const unavailableIds = new Set(unavailableRows.map(r => r.ptero_node_id));
      if (unavailableIds.size > 0) {
        const allNodes = await getAllNodes();
        const availableNodes = allNodes.filter(n => !unavailableIds.has(n.id));
        const locationIds = [...new Set(availableNodes.map(n => n.location_id).filter(Boolean))];
        if (locationIds.length === 0) {
          return res.status(400).json({ error: 'No available nodes for deployment' });
        }
        deployLocations = locationIds;
      }
    } catch (err) {
      console.warn('Failed to check unavailable nodes:', err.message);
    }

    const server = await createPteroServer({
      name,
      userId: pteroId,
      eggId,
      nestId,
      environment: mergedEnv,
      startup: egg.startup,
      dockerImage,
      customLimits: Object.keys(customLimits).length > 0 ? customLimits : undefined,
      deployLocations,
    });

    // Log server creation date
    await query(
      'INSERT INTO server_meta (ptero_server_id, user_id, created_at, expires_at, status) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 90 DAY), ?)',
      [server.id, req.user.userId, 'active']
    ).catch(err => console.error('Failed to log server meta:', err.message));

    await logActivity(req.user.userId, 'server_created', `Created server "${name}"`, server.id);
    await createNotification(req.user.userId, 'Server Created', `Your server "${name}" has been created and is now being set up.`, 'success', `/servers`);
    res.status(201).json({ server });
  } catch (err) {
    console.error('Create server error:', err.message);
    if (err.message.includes('NoViableNodeException')) {
      return res.status(400).json({ error: 'No available nodes found for deployment' });
    }
    if (err.message.includes('NoViableAllocationException')) {
      return res.status(400).json({ error: 'No available allocations found' });
    }
    res.status(500).json({ error: 'Failed to create server' });
  }
});

router.get('/details/:id', authenticateToken, requireOwnership('server_meta', 'ptero_server_id', 'id'), async (req, res) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    if (isNaN(serverId)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }
    const server = await getServerById(serverId);
    const meta = await query('SELECT * FROM server_meta WHERE ptero_server_id = ?', [serverId]);
    server.serverMeta = meta.length > 0 ? meta[0] : null;

    const users = await query('SELECT ptero_client_api_key FROM users WHERE id = ?', [req.user.userId]);
    const clientApiKey = users[0]?.ptero_client_api_key;
    if (clientApiKey) {
      try {
        const pteroRes = await fetch(`${PTERO_URL}/api/client/servers/${server.identifier}/resources`, {
          headers: {
            'Authorization': `Bearer ${clientApiKey}`,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (pteroRes.ok) {
          const data = await pteroRes.json();
          server.currentState = data.attributes.current_state;
        }
      } catch {
        server.currentState = null;
      }
    }

    res.json({ server });
  } catch (err) {
    console.error('Get server error:', err.message);
    res.status(500).json({ error: 'Failed to fetch server details' });
  }
});

router.post('/renew/:id', authenticateToken, requireNotRestricted, requireOwnership('server_meta', 'ptero_server_id', 'id'), renewLimiter, async (req, res) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    if (isNaN(serverId)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }

    const meta = await query('SELECT * FROM server_meta WHERE ptero_server_id = ?', [serverId]);
    if (meta.length === 0) {
      return res.status(404).json({ error: 'Server meta not found' });
    }

    const row = meta[0];

    // Block renewal if suspended by an admin
    if (row.suspended_by === 'admin') {
      return res.status(403).json({ error: 'Suspended by an Administrator. Please contact support.' });
    }

    // Check if within renewal window (7 days before expiration)
    const now = new Date();
    const expires = new Date(row.expires_at);
    const daysUntilExpiry = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry > 7) {
      return res.status(400).json({ error: 'Server can only be renewed within 7 days of expiration' });
    }

    if (daysUntilExpiry < -7) {
      return res.status(400).json({ error: 'Server has been expired for too long. Contact support.' });
    }

    // Extend by 90 days
    await query(
      'UPDATE server_meta SET expires_at = DATE_ADD(expires_at, INTERVAL 90 DAY), status = ?, suspend_reason = NULL WHERE id = ?',
      [row.status === 'suspended' ? 'active' : row.status, row.id]
    );

    // Unsuspend on Pyrodactyl if currently suspended
    if (row.status === 'suspended') {
      try {
        await unsuspendPteroServer(serverId);
      } catch (err) {
        console.error('Failed to unsuspend server:', err.message);
      }
    }

    await logActivity(req.user.userId, 'server_renewed', `Renewed server #${serverId}`, serverId);
    await createNotification(req.user.userId, 'Server Renewed', `Your server #${serverId} has been renewed for another 90 days.`, 'success', `/server/${serverId}`);
    const updated = await query('SELECT * FROM server_meta WHERE id = ?', [row.id]);
    res.json({ serverMeta: updated[0] });
  } catch (err) {
    console.error('Renew server error:', err.message);
    res.status(500).json({ error: 'Failed to renew server' });
  }
});

router.patch('/:id', authenticateToken, requireNotRestricted, requireOwnership('server_meta', 'ptero_server_id', 'id'), renameLimiter, async (req, res) => {
  try {
    const { name } = req.body;
    const serverId = parseInt(req.params.id, 10);
    if (isNaN(serverId)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Server name is required' });
    }
    if (name.trim().length > 255) {
      return res.status(400).json({ error: 'Server name must be 255 characters or less' });
    }
    if (!/^[a-zA-Z0-9 _.-]+$/.test(name.trim())) {
      return res.status(400).json({ error: 'Server name contains invalid characters' });
    }

    await renamePteroServer(serverId, name.trim());
    await logActivity(req.user.userId, 'server_renamed', `Renamed server #${serverId} to "${name.trim()}"`, serverId);
    await createNotification(req.user.userId, 'Server Renamed', `Your server #${serverId} has been renamed to "${name.trim()}".`, 'info', `/server/${serverId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Rename server error:', err.message);
    res.status(500).json({ error: 'Failed to rename server' });
  }
});

router.post('/:id/reinstall', authenticateToken, requireNotRestricted, requireOwnership('server_meta', 'ptero_server_id', 'id'), reinstallLimiter, async (req, res) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    if (isNaN(serverId)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }

    await reinstallPteroServer(serverId);
    await logActivity(req.user.userId, 'server_reinstalled', `Reinstalled server #${serverId}`, serverId);
    await createNotification(req.user.userId, 'Server Reinstalled', `Your server #${serverId} is being reinstalled.`, 'warning', `/server/${serverId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Reinstall server error:', err.message);
    res.status(500).json({ error: 'Failed to reinstall server' });
  }
});

router.delete('/:id', authenticateToken, requireNotRestricted, requireOwnership('server_meta', 'ptero_server_id', 'id'), async (req, res) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    if (isNaN(serverId)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }
    const meta = await query('SELECT status FROM server_meta WHERE ptero_server_id = ?', [serverId]);
    if (meta.length > 0 && meta[0].status === 'suspended') {
      return res.status(403).json({ error: 'Cannot delete a suspended server' });
    }
    try {
      await deletePteroServer(serverId);
    } catch (err) {
      console.warn('Pterodactyl delete failed (proceeding with local cleanup):', err.message);
    }
    await query('DELETE FROM server_meta WHERE ptero_server_id = ?', [serverId]);
    await logActivity(req.user.userId, 'server_deleted', `Deleted server #${serverId}`);
    await createNotification(req.user.userId, 'Server Deleted', `Your server #${serverId} has been permanently deleted.`, 'error');
    res.json({ success: true });
  } catch (err) {
    console.error('Delete server error:', err.message);
    res.status(500).json({ error: 'Failed to delete server' });
  }
});

router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const pteroId = req.user.pteroId;
    const restricted = req.user.restricted;

    let servers = [];
    try {
      servers = await getServersByUser(pteroId);
    } catch (err) {
      console.error('Overview Pyrodactyl error:', err.message);
      return res.json({
        restricted,
        totalServers: 0,
        activeServers: 0,
        servers: [],
        pteroError: 'Pyrodactyl panel is currently unreachable. Some data may be unavailable.',
      });
    }

    for (const s of servers) {
      try {
        const meta = await query('SELECT * FROM server_meta WHERE ptero_server_id = ?', [s.id]);
        s.serverMeta = meta.length > 0 ? meta[0] : null;
      } catch {
        s.serverMeta = null;
      }
    }

    res.json({
      restricted,
      totalServers: servers.length,
      activeServers: servers.filter(s => s.status !== 'suspended').length,
      serverLimit: 3,
      servers,
    });
  } catch (err) {
    console.error('Overview error:', err.message);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

async function verifyServerOwnership(userId, identifier) {
  try {
    const servers = await getServersByUser(userId);
    return servers.some(s => s.identifier === identifier);
  } catch {
    return false;
  }
}

router.get('/resources/:identifier', authenticateToken, async (req, res) => {
  try {
    const { identifier } = req.params;
    const userId = req.user.userId;

    if (!await verifyServerOwnership(userId, identifier)) {
      return res.status(403).json({ error: 'You do not own this server' });
    }

    const users = await query('SELECT ptero_client_api_key FROM users WHERE id = ?', [userId]);
    if (users.length === 0 || !users[0].ptero_client_api_key) {
      return res.json({ resources: null, error: 'No Pyrodactyl API key configured. Set one in Account settings.' });
    }

    const apiKey = users[0].ptero_client_api_key;
    const pteroRes = await fetch(`${PTERO_URL}/api/client/servers/${identifier}/resources`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!pteroRes.ok) {
      return res.status(502).json({ error: 'Failed to fetch resources from panel' });
    }

    const data = await pteroRes.json();
    res.json({ resources: data.attributes.resources, current_state: data.attributes.current_state });
  } catch (err) {
    console.error('Resources error:', err.message);
    res.status(500).json({ error: 'Failed to fetch server resources' });
  }
});

router.post('/power/:identifier', authenticateToken, powerLimiter, async (req, res) => {
  try {
    const { identifier } = req.params;
    const { signal } = req.body;
    const userId = req.user.userId;

    if (!await verifyServerOwnership(userId, identifier)) {
      return res.status(403).json({ error: 'You do not own this server' });
    }

    const VALID_SIGNALS = ['start', 'stop', 'restart', 'kill'];
    if (!signal || typeof signal !== 'string' || !VALID_SIGNALS.includes(signal)) {
      return res.status(400).json({ error: 'Invalid power signal. Valid signals: start, stop, restart, kill' });
    }

    const users = await query('SELECT ptero_client_api_key FROM users WHERE id = ?', [userId]);
    if (!users[0]?.ptero_client_api_key) {
      return res.status(400).json({ error: 'No Pyrodactyl API key configured' });
    }

    const apiKey = users[0].ptero_client_api_key;
    const pteroRes = await fetch(`${PTERO_URL}/api/client/servers/${identifier}/power`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ signal }),
      signal: AbortSignal.timeout(10000),
    });

    if (!pteroRes.ok) {
      return res.status(502).json({ error: 'Failed to send power command' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Power command error:', err.message);
    res.status(500).json({ error: 'Failed to send power command' });
  }
});

router.get('/client-api-key', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = await query('SELECT ptero_client_api_key FROM users WHERE id = ?', [userId]);
    const hasKey = rows.length > 0 && rows[0].ptero_client_api_key !== null;
    res.json({ hasKey });
  } catch (err) {
    console.error('API key check error:', err.message);
    res.status(500).json({ error: 'Failed to check API key status' });
  }
});

router.put('/client-api-key', authenticateToken, async (req, res) => {
  try {
    const { apiKey } = req.body;
    const userId = req.user.userId;

    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ error: 'API key is required' });
    }

    if (apiKey.trim().length > 255) {
      return res.status(400).json({ error: 'API key must be 255 characters or less' });
    }

    await query('UPDATE users SET ptero_client_api_key = ? WHERE id = ?', [apiKey.trim(), userId]);
    await logActivity(req.user.userId, 'api_key_updated', 'Updated Pyrodactyl API key');

    res.json({ success: true });
  } catch (err) {
    console.error('API key update error:', err.message);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

router.delete('/client-api-key', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    await query('UPDATE users SET ptero_client_api_key = NULL WHERE id = ?', [userId]);
    await logActivity(req.user.userId, 'api_key_deleted', 'Deleted Pyrodactyl API key');
    res.json({ success: true });
  } catch (err) {
    console.error('API key delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

export default router;
