import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getServersByUser,
  getServerById,
  createPteroServer,
  deletePteroServer,
  reinstallPteroServer,
  renamePteroServer,
  suspendPteroServer,
  unsuspendPteroServer,
  getEgg,
  getAllEggs,
  getPteroUserById,
} from '../services/pterodactyl.js';
import { query } from '../config/db.js';
import { verifyTurnstile } from '../config/turnstile.js';

const router = Router();

router.get('/list', authenticateToken, async (req, res) => {
  try {
    const pteroId = req.user.pteroId;
    let servers = [];
    try {
      servers = await getServersByUser(pteroId);
    } catch (err) {
      console.error('List servers Pterodactyl error:', err.message);
      return res.json({ servers: [], pteroError: 'Pterodactyl panel is currently unreachable.' });
    }

    for (const s of servers) {
      try {
        const meta = await query('SELECT * FROM server_meta WHERE ptero_server_id = ?', [s.id]);
        s.serverMeta = meta.length > 0 ? meta[0] : null;
      } catch {
        s.serverMeta = null;
      }
    }

    res.json({ servers });
  } catch (err) {
    console.error('List servers error:', err.message);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

router.get('/eggs', authenticateToken, async (req, res) => {
  try {
    const eggs = await getAllEggs();
    const simplified = [];

    for (const { nest, egg } of eggs) {
      let variables = [];
      try {
        const vars = await query('SELECT name, env_variable, default_value, rules, description, user_viewable, user_editable FROM panel.egg_variables WHERE egg_id = ?', [egg.id]);
        variables = vars;
      } catch {}
      simplified.push({
        nestId: nest,
        eggId: egg.id,
        name: egg.name,
        description: egg.description,
        startup: egg.startup,
        dockerImages: egg.docker_images,
        configStop: egg.config?.stop || '^^C',
        configStartup: egg.config?.startup || null,
        variables: variables.map(v => ({
          name: v.name,
          envVariable: v.env_variable,
          defaultValue: v.default_value,
          rules: v.rules,
          description: v.description,
          userViewable: v.user_viewable,
          userEditable: v.user_editable,
        })),
      });
    }
    res.json({ eggs: simplified });
  } catch (err) {
    console.error('Get eggs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch eggs' });
  }
});

router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { name, nestId, eggId, environment, cfTurnstile } = req.body;
    const pteroId = req.user.pteroId;

    if (!name || !nestId || !eggId) {
      return res.status(400).json({ error: 'Name, nest ID and egg ID are required' });
    }

    if (name.length < 1 || name.length > 255) {
      return res.status(400).json({ error: 'Server name must be between 1 and 255 characters' });
    }

    if (!await verifyTurnstile(cfTurnstile)) {
      return res.status(400).json({ error: 'Please complete the security check' });
    }

    const existingServers = await getServersByUser(pteroId);
    if (existingServers.length >= 3) {
      return res.status(403).json({ error: 'Server limit reached. You can only create up to 3 servers.' });
    }

    const egg = await getEgg(nestId, eggId);
    const dockerImage = Object.values(egg.docker_images)[0] || Object.keys(egg.docker_images)[0];

    const eggVars = await query('SELECT name, env_variable, default_value, rules FROM panel.egg_variables WHERE egg_id = ?', [eggId]);

    const mergedEnv = {};
    for (const v of eggVars) {
      const val = environment?.[v.env_variable] ?? v.default_value ?? '';
      if (v.rules && v.rules.includes('required') && !val) {
        return res.status(400).json({ error: `The ${v.name} variable is required.` });
      }
      mergedEnv[v.env_variable] = val;
    }

    const server = await createPteroServer({
      name,
      userId: pteroId,
      eggId,
      nestId,
      environment: mergedEnv,
      startup: egg.startup,
      dockerImage,
    });

    // Log server creation date
    await query(
      'INSERT INTO server_meta (ptero_server_id, user_id, created_at, expires_at, status) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 90 DAY), ?)',
      [server.id, req.user.userId, 'active']
    ).catch(err => console.error('Failed to log server meta:', err.message));

    res.status(201).json({ server });
  } catch (err) {
    console.error('Create server error:', err.message);
    if (err.message.includes('NoViableNodeException')) {
      return res.status(400).json({ error: 'No available nodes found for deployment' });
    }
    if (err.message.includes('NoViableAllocationException')) {
      return res.status(400).json({ error: 'No available allocations found' });
    }
    res.status(500).json({ error: 'Failed to create server: ' + err.message });
  }
});

router.get('/details/:id', authenticateToken, async (req, res) => {
  try {
    const server = await getServerById(req.params.id);
    const meta = await query('SELECT * FROM server_meta WHERE ptero_server_id = ?', [req.params.id]);
    server.serverMeta = meta.length > 0 ? meta[0] : null;
    res.json({ server });
  } catch (err) {
    console.error('Get server error:', err.message);
    res.status(500).json({ error: 'Failed to fetch server details' });
  }
});

router.post('/renew/:id', authenticateToken, async (req, res) => {
  try {
    const serverId = parseInt(req.params.id);
    const pteroId = req.user.pteroId;

    const meta = await query('SELECT * FROM server_meta WHERE ptero_server_id = ?', [serverId]);
    if (meta.length === 0) {
      return res.status(404).json({ error: 'Server meta not found' });
    }

    const row = meta[0];

    // Verify the server belongs to this user
    const servers = await getServersByUser(pteroId);
    const owned = servers.find(s => s.id === serverId);
    if (!owned) {
      return res.status(403).json({ error: 'Server does not belong to you' });
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
      'UPDATE server_meta SET expires_at = DATE_ADD(expires_at, INTERVAL 90 DAY), status = ? WHERE id = ?',
      [row.status === 'suspended' ? 'active' : row.status, row.id]
    );

    // Unsuspend on Pterodactyl if currently suspended
    if (row.status === 'suspended') {
      try {
        await unsuspendPteroServer(serverId);
      } catch (err) {
        console.error('Failed to unsuspend server:', err.message);
      }
    }

    const updated = await query('SELECT * FROM server_meta WHERE id = ?', [row.id]);
    res.json({ serverMeta: updated[0] });
  } catch (err) {
    console.error('Renew server error:', err.message);
    res.status(500).json({ error: 'Failed to renew server: ' + err.message });
  }
});

router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const serverId = parseInt(req.params.id);
    const pteroId = req.user.pteroId;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Server name is required' });
    }
    if (name.length > 255) {
      return res.status(400).json({ error: 'Server name must be 255 characters or less' });
    }

    const servers = await getServersByUser(pteroId);
    const owned = servers.find(s => s.id === serverId);
    if (!owned) {
      return res.status(403).json({ error: 'Server does not belong to you' });
    }

    await renamePteroServer(serverId, name.trim());
    res.json({ success: true });
  } catch (err) {
    console.error('Rename server error:', err.message);
    res.status(500).json({ error: 'Failed to rename server: ' + err.message });
  }
});

router.post('/:id/reinstall', authenticateToken, async (req, res) => {
  try {
    const serverId = parseInt(req.params.id);
    const pteroId = req.user.pteroId;

    const servers = await getServersByUser(pteroId);
    const owned = servers.find(s => s.id === serverId);
    if (!owned) {
      return res.status(403).json({ error: 'Server does not belong to you' });
    }

    await reinstallPteroServer(serverId);
    res.json({ success: true });
  } catch (err) {
    console.error('Reinstall server error:', err.message);
    res.status(500).json({ error: 'Failed to reinstall server: ' + err.message });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await deletePteroServer(req.params.id);
    await query('DELETE FROM server_meta WHERE ptero_server_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete server error:', err.message);
    res.status(500).json({ error: 'Failed to delete server: ' + err.message });
  }
});

router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const pteroId = req.user.pteroId;
    let servers = [];
    try {
      servers = await getServersByUser(pteroId);
    } catch (err) {
      console.error('Overview Pterodactyl error:', err.message);
      return res.json({
        totalServers: 0,
        activeServers: 0,
        servers: [],
        pteroError: 'Pterodactyl panel is currently unreachable. Some data may be unavailable.',
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

export default router;
