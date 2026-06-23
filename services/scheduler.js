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

function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

export function startScheduler() {
  suspendExpiredServers().catch(err => console.error('Initial scheduler run failed:', err.message));
  const tick = () => {
    setTimeout(async () => {
      try {
        await suspendExpiredServers();
      } catch (err) {
        console.error('Scheduled suspension failed:', err.message);
      }
      tick();
    }, msUntilMidnight());
  };
  tick();
  console.log('Server lifetime scheduler started');
}
