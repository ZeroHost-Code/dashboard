import { query } from '../config/db.js';
import { suspendPteroServer } from './pyrodactyl.js';

async function suspendExpiredServers() {
  try {
    const expired = await query(
      "SELECT * FROM server_meta WHERE expires_at <= NOW() AND status = 'active'"
    );
    for (const row of expired) {
      try {
        await suspendPteroServer(row.ptero_server_id);
        await query("UPDATE server_meta SET status = 'suspended' WHERE id = ?", [row.id]);
        console.log(`Suspended server ${row.ptero_server_id} (expired)`);
      } catch (err) {
        console.error(`Failed to suspend server ${row.ptero_server_id}:`, err.message);
      }
    }
    if (expired.length > 0) {
      console.log(`Suspended ${expired.length} expired server(s)`);
    }
  } catch (err) {
    console.error('Scheduler check error:', err.message);
  }
}

export function startScheduler() {
  suspendExpiredServers();
  setInterval(async () => {
    const hour = new Date().getHours();
    if (hour === 0) {
      await suspendExpiredServers();
    }
  }, 3600000);
  console.log('Server lifetime scheduler started');
}
