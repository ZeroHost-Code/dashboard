import { query } from '../config/db.js';
import { suspendPteroServer } from './pyrodactyl.js';
import { createNotification } from './notification.js';

async function suspendExpiredServers() {
  try {
    const expired = await query(
      "SELECT * FROM server_meta WHERE expires_at <= NOW() AND status = 'active'"
    );
    for (const row of expired) {
      try {
        await suspendPteroServer(row.ptero_server_id);
        await query("UPDATE server_meta SET status = 'suspended' WHERE id = ?", [row.id]);
        await createNotification(row.user_id, 'Server Expired', `Your server #${row.ptero_server_id} has been suspended due to expiry. Renew it to reactivate.`, 'warning', `/servers`);
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

let schedulerTimer = null;
let schedulerRunning = false;

export function stopScheduler() {
  schedulerRunning = false;
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
}

export function startScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  suspendExpiredServers().catch(err => console.error('Initial scheduler run failed:', err.message));
  const tick = () => {
    if (!schedulerRunning) return;
    schedulerTimer = setTimeout(async () => {
      if (!schedulerRunning) return;
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

  cleanupOldNotifications().catch(err => console.error('Initial notification cleanup failed:', err.message));
  cleanupOldActivityLogs().catch(err => console.error('Initial activity log cleanup failed:', err.message));
}

async function cleanupOldNotifications() {
  try {
    const result = await query(
      "DELETE FROM notifications WHERE created_at < NOW() - INTERVAL 90 DAY AND read = 1"
    );
    if (result.affectedRows > 0) {
      console.log(`Cleaned up ${result.affectedRows} old read notification(s)`);
    }
  } catch (err) {
    console.error('Notification cleanup error:', err.message);
  }
}

async function cleanupOldActivityLogs() {
  try {
    const result = await query(
      "DELETE FROM activity_logs WHERE created_at < NOW() - INTERVAL 90 DAY"
    );
    if (result.affectedRows > 0) {
      console.log(`Cleaned up ${result.affectedRows} old activity log(s)`);
    }
  } catch (err) {
    console.error('Activity log cleanup error:', err.message);
  }
}
