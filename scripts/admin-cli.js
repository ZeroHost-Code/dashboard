import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

import argon2 from 'argon2';

const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];
const arg3 = process.argv[5];

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'zerohost';
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME || 'zerohost_dashboard';

if (!DB_PASSWORD) {
  console.error('Error: DB_PASSWORD not found in .env');
  process.exit(1);
}

let conn;
try {
  const mariadb = createRequire(import.meta.url)('mariadb');
  conn = await mariadb.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });
} catch (err) {
  console.error('Failed to connect to database:', err.message);
  process.exit(1);
}

async function auditLog(action, details) {
  try {
    await conn.query(
      'INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)',
      [0, action, '[CLI] ' + details]
    );
  } catch (err) {
    console.error('Failed to audit log:', err.message);
  }
}

async function usage() {
  console.log(`
Usage:
  node scripts/admin-cli.js create <email> <username> <password>
    Create a new admin account

  node scripts/admin-cli.js set-admin <email>
    Set an existing user as admin by email

  node scripts/admin-cli.js set-admin-by-username <username>
    Set an existing user as admin by username

  node scripts/admin-cli.js list
    List all admin users

  node scripts/admin-cli.js remove-admin <email>
    Remove admin privileges from a user
`);
}

async function createAdmin(email, username, password) {
  if (!email || !username || !password) {
    console.error('Error: email, username, and password are required');
    await usage();
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: password must be at least 8 characters');
    process.exit(1);
  }

  const existing = await conn.query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
  if (existing.length > 0) {
    console.error('Error: A user with this email or username already exists');
    process.exit(1);
  }

  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const result = await conn.query(
    'INSERT INTO users (email, username, password_hash, first_name, last_name, password_set, is_admin) VALUES (?, ?, ?, ?, ?, 1, 1)',
    [email, username, hash, username, 'Admin']
  );

  await auditLog('admin_cli_create', `Created admin account: ${username} (${email}) - ID: ${result.insertId}`);
  console.log(`Admin account created: ${username} (${email}) - ID: ${result.insertId}`);
}

async function setAdmin(email) {
  if (!email) {
    console.error('Error: email is required');
    await usage();
    process.exit(1);
  }

  const result = await conn.query('UPDATE users SET is_admin = 1 WHERE email = ?', [email]);
  if (result.affectedRows === 0) {
    console.error(`Error: No user found with email ${email}`);
    process.exit(1);
  }

  await auditLog('admin_cli_set_admin', `Granted admin privileges to ${email}`);
  console.log(`Admin privileges granted to ${email}`);
}

async function setAdminByUsername(username) {
  if (!username) {
    console.error('Error: username is required');
    await usage();
    process.exit(1);
  }

  const result = await conn.query('UPDATE users SET is_admin = 1 WHERE username = ?', [username]);
  if (result.affectedRows === 0) {
    console.error(`Error: No user found with username ${username}`);
    process.exit(1);
  }

  await auditLog('admin_cli_set_admin', `Granted admin privileges to ${username} (by username)`);
  console.log(`Admin privileges granted to ${username}`);
}

async function listAdmins() {
  const admins = await conn.query('SELECT id, email, username, created_at FROM users WHERE is_admin = 1');
  if (admins.length === 0) {
    console.log('No admin users found.');
    return;
  }

  console.log('Admin users:');
  for (const a of admins) {
    console.log(`  [${a.id}] ${a.username} <${a.email}> (created: ${a.created_at?.toISOString?.() || a.created_at})`);
  }
}

async function removeAdmin(email) {
  if (!email) {
    console.error('Error: email is required');
    await usage();
    process.exit(1);
  }

  const result = await conn.query('UPDATE users SET is_admin = 0 WHERE email = ?', [email]);
  if (result.affectedRows === 0) {
    console.error(`Error: No user found with email ${email}`);
    process.exit(1);
  }

  await auditLog('admin_cli_remove_admin', `Removed admin privileges from ${email}`);
  console.log(`Admin privileges removed from ${email}`);
}

switch (command) {
  case 'create':
    await createAdmin(arg1, arg2, arg3);
    break;
  case 'set-admin':
    await setAdmin(arg1);
    break;
  case 'set-admin-by-username':
    await setAdminByUsername(arg1);
    break;
  case 'list':
    await listAdmins();
    break;
  case 'remove-admin':
    await removeAdmin(arg1);
    break;
  default:
    await usage();
    break;
}

await conn.end();
