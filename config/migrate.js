import { query } from './db.js';

const tables = {
  users: {
    columns: [
      { name: 'id', def: 'INT AUTO_INCREMENT PRIMARY KEY' },
      { name: 'email', def: 'VARCHAR(255) NOT NULL' },
      { name: 'username', def: 'VARCHAR(255) NOT NULL' },
      { name: 'password_hash', def: 'VARCHAR(255) NOT NULL' },
      { name: 'ptero_user_id', def: 'INT' },
      { name: 'ptero_uuid', def: 'VARCHAR(255)' },
      { name: 'first_name', def: 'VARCHAR(255)' },
      { name: 'last_name', def: 'VARCHAR(255)' },
      { name: 'password_set', def: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'is_admin', def: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'restricted', def: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'auth_restricted', def: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'token_version', def: 'INT NOT NULL DEFAULT 0' },
      { name: 'avatar', def: 'VARCHAR(255) DEFAULT NULL' },
      { name: 'ptero_client_api_key', def: 'VARCHAR(255) DEFAULT NULL' },
      { name: 'email_verified', def: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'verification_token', def: 'VARCHAR(64) DEFAULT NULL' },
      { name: 'verification_token_expires', def: 'DATETIME DEFAULT NULL' },
      { name: 'created_at', def: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
    ],
  },
  server_meta: {
    columns: [
      { name: 'id', def: 'INT AUTO_INCREMENT PRIMARY KEY' },
      { name: 'ptero_server_id', def: 'INT NOT NULL' },
      { name: 'user_id', def: 'INT NOT NULL' },
      { name: 'created_at', def: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
      { name: 'expires_at', def: 'TIMESTAMP NOT NULL' },
      { name: 'status', def: "ENUM('active', 'suspended', 'expired') DEFAULT 'active'" },
      { name: 'suspend_reason', def: 'TEXT DEFAULT NULL' },
      { name: 'suspended_by', def: "VARCHAR(20) DEFAULT NULL" },
    ],
  },
  user_ips: {
    columns: [
      { name: 'id', def: 'INT AUTO_INCREMENT PRIMARY KEY' },
      { name: 'user_id', def: 'INT NOT NULL' },
      { name: 'ip_address', def: 'VARCHAR(45) NOT NULL' },
      { name: 'created_at', def: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
    ],
  },
  activity_log: {
    columns: [
      { name: 'id', def: 'INT AUTO_INCREMENT PRIMARY KEY' },
      { name: 'user_id', def: 'INT NOT NULL' },
      { name: 'action', def: 'VARCHAR(50) NOT NULL' },
      { name: 'details', def: 'VARCHAR(255) DEFAULT \'\'' },
      { name: 'server_id', def: 'INT DEFAULT NULL' },
      { name: 'created_at', def: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
    ],
  },
  nests: {
    columns: [
      { name: 'id', def: 'INT AUTO_INCREMENT PRIMARY KEY' },
      { name: 'ptero_nest_id', def: 'INT NOT NULL UNIQUE' },
      { name: 'name', def: 'VARCHAR(255) NOT NULL' },
      { name: 'logo', def: 'VARCHAR(255) DEFAULT NULL' },
      { name: 'description', def: 'TEXT DEFAULT NULL' },
      { name: 'unavailable', def: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'created_at', def: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
    ],
  },
  egg_resources: {
    columns: [
      { name: 'id', def: 'INT AUTO_INCREMENT PRIMARY KEY' },
      { name: 'ptero_nest_id', def: 'INT NOT NULL' },
      { name: 'ptero_egg_id', def: 'INT NOT NULL' },
      { name: 'logo', def: 'VARCHAR(255) DEFAULT NULL' },
      { name: 'cpu_limit', def: 'INT DEFAULT NULL' },
      { name: 'memory_limit', def: 'INT DEFAULT NULL' },
      { name: 'disk_limit', def: 'INT DEFAULT NULL' },
      { name: 'unavailable', def: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'created_at', def: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
      { name: 'updated_at', def: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
    ],
  },
  notifications: {
    columns: [
      { name: 'id', def: 'INT AUTO_INCREMENT PRIMARY KEY' },
      { name: 'user_id', def: 'INT NOT NULL' },
      { name: 'title', def: 'VARCHAR(255) NOT NULL' },
      { name: 'message', def: 'TEXT NOT NULL' },
      { name: 'type', def: "VARCHAR(20) NOT NULL DEFAULT 'info'" },
      { name: 'link', def: 'VARCHAR(255) DEFAULT NULL' },
      { name: 'is_read', def: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'created_at', def: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
    ],
  },
  passkeys: {
    columns: [
      { name: 'id', def: 'INT AUTO_INCREMENT PRIMARY KEY' },
      { name: 'user_id', def: 'INT NOT NULL' },
      { name: 'credential_id', def: 'VARCHAR(512) NOT NULL' },
      { name: 'public_key', def: 'TEXT NOT NULL' },
      { name: 'counter', def: 'INT NOT NULL DEFAULT 0' },
      { name: 'transports', def: 'VARCHAR(255) DEFAULT NULL' },
      { name: 'name', def: 'VARCHAR(255) DEFAULT NULL' },
      { name: 'created_at', def: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
    ],
  },
  node_settings: {
    columns: [
      { name: 'id', def: 'INT AUTO_INCREMENT PRIMARY KEY' },
      { name: 'ptero_node_id', def: 'INT NOT NULL UNIQUE' },
      { name: 'unavailable', def: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'created_at', def: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
      { name: 'updated_at', def: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
    ],
  },

};

function escapeId(id) {
  return '`' + String(id).replace(/`/g, '``') + '`';
}

function escapeLike(id) {
  return String(id).replace(/[%_\\]/g, '\\$&');
}

const constraints = [
  { table: 'server_meta', sql: 'ALTER TABLE server_meta ADD INDEX idx_expires (expires_at)', name: 'idx_expires' },
  { table: 'server_meta', sql: 'ALTER TABLE server_meta ADD INDEX idx_user (user_id)', name: 'idx_user' },
  { table: 'server_meta', sql: 'ALTER TABLE server_meta ADD INDEX idx_status (status)', name: 'idx_status' },
  { table: 'user_ips', sql: 'ALTER TABLE user_ips ADD INDEX idx_ip (ip_address)', name: 'idx_ip' },
  { table: 'user_ips', sql: 'ALTER TABLE user_ips ADD INDEX idx_user (user_id)', name: 'idx_user' },
  { table: 'user_ips', sql: 'ALTER TABLE user_ips ADD CONSTRAINT fk_user_ips_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE', name: 'fk_user_ips_user' },
  { table: 'activity_log', sql: 'ALTER TABLE activity_log ADD INDEX idx_activity_user (user_id)', name: 'idx_activity_user' },
  { table: 'activity_log', sql: 'ALTER TABLE activity_log ADD INDEX idx_activity_created (created_at)', name: 'idx_activity_created' },
  { table: 'egg_resources', sql: 'ALTER TABLE egg_resources ADD UNIQUE INDEX idx_egg_resources_nest_egg (ptero_nest_id, ptero_egg_id)', name: 'idx_egg_resources_nest_egg' },
  { table: 'notifications', sql: 'ALTER TABLE notifications ADD INDEX idx_notif_user (user_id)', name: 'idx_notif_user' },
  { table: 'notifications', sql: 'ALTER TABLE notifications ADD INDEX idx_notif_user_read (user_id, is_read)', name: 'idx_notif_user_read' },
  { table: 'notifications', sql: 'ALTER TABLE notifications ADD INDEX idx_notif_created (created_at)', name: 'idx_notif_created' },
  { table: 'notifications', sql: 'ALTER TABLE notifications ADD CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE', name: 'fk_notif_user' },
  { table: 'users', sql: 'ALTER TABLE users ADD INDEX idx_email (email)', name: 'idx_user_email' },
  { table: 'users', sql: 'ALTER TABLE users ADD INDEX idx_username (username)', name: 'idx_user_username' },
  { table: 'activity_log', sql: 'ALTER TABLE activity_log ADD INDEX idx_action (action)', name: 'idx_activity_action' },
  { table: 'activity_log', sql: 'ALTER TABLE activity_log ADD CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE', name: 'fk_activity_user' },
  { table: 'server_meta', sql: 'ALTER TABLE server_meta ADD INDEX idx_ptero_server (ptero_server_id)', name: 'idx_ptero_server' },
  { table: 'server_meta', sql: 'ALTER TABLE server_meta ADD CONSTRAINT fk_server_meta_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE', name: 'fk_server_meta_user' },
  { table: 'passkeys', sql: 'ALTER TABLE passkeys ADD INDEX idx_passkey_user (user_id)', name: 'idx_passkey_user' },
  { table: 'passkeys', sql: 'ALTER TABLE passkeys ADD INDEX idx_passkey_credential (credential_id(255))', name: 'idx_passkey_credential' },
  { table: 'passkeys', sql: 'ALTER TABLE passkeys ADD CONSTRAINT fk_passkey_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE', name: 'fk_passkey_user' },
  { table: 'node_settings', sql: 'ALTER TABLE node_settings ADD INDEX idx_node_settings_node (ptero_node_id)', name: 'idx_node_settings_node' },
];

export async function migrate() {
  for (const [table, schema] of Object.entries(tables)) {
    try {
      const safeTable = escapeId(table);
      const exists = await query(`SHOW TABLES LIKE ?`, [escapeLike(table)]);
      if (exists.length === 0) {
        const colDefs = schema.columns.map(c => `${escapeId(c.name)} ${c.def}`).join(', ');
        await query(`CREATE TABLE ${safeTable} (${colDefs})`);
        console.log(`Created table: ${table}`);
        continue;
      }

      for (const col of schema.columns) {
        try {
          const safeCol = escapeId(col.name);
          const cols = await query(`SHOW COLUMNS FROM ${safeTable} LIKE ?`, [escapeLike(col.name)]);
          if (cols.length === 0) {
            await query(`ALTER TABLE ${safeTable} ADD COLUMN ${safeCol} ${col.def}`);
            console.log(`Added column ${table}.${col.name}`);
          }
        } catch (err) {
          console.error(`Migration error ${table}.${col.name}:`, err.message);
        }
      }
    } catch (err) {
      console.error(`Migration error for table ${table}:`, err.message);
    }
  }

  for (const c of constraints) {
    try {
      await query(c.sql);
      console.log(`Applied constraint: ${c.name}`);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`Skipped constraint ${c.name}: ${err.message}`);
      }
    }
  }
}
