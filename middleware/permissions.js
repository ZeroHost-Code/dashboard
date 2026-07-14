export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
};

export const PERMISSIONS = {
  // Server actions
  SERVER_CREATE: 'server:create',
  SERVER_RENEW: 'server:renew',
  SERVER_RENAME: 'server:rename',
  SERVER_REINSTALL: 'server:reinstall',
  SERVER_DELETE: 'server:delete',
  SERVER_POWER: 'server:power',
  SERVER_LIST: 'server:list',
  SERVER_DETAILS: 'server:details',
  SERVER_OVERVIEW: 'server:overview',

  // API key actions
  API_KEY_READ: 'api_key:read',
  API_KEY_WRITE: 'api_key:write',
  API_KEY_DELETE: 'api_key:delete',

  // Account actions
  ACCOUNT_CHANGE_PASSWORD: 'account:change_password',
  ACCOUNT_CHANGE_EMAIL: 'account:change_email',
  ACCOUNT_DELETE: 'account:delete',
  ACCOUNT_EXPORT_DATA: 'account:export_data',
  ACCOUNT_UPLOAD_AVATAR: 'account:upload_avatar',
  ACCOUNT_VIEW_AVATAR: 'account:view_avatar',

  // Notification actions
  NOTIFICATION_LIST: 'notification:list',
  NOTIFICATION_READ: 'notification:read',
  NOTIFICATION_READ_ALL: 'notification:read_all',

  // Activity actions
  ACTIVITY_LIST: 'activity:list',

  // Admin actions
  ADMIN_LOGIN: 'admin:login',
  ADMIN_CHECK: 'admin:check',
  ADMIN_LIST_SERVERS: 'admin:list_servers',
  ADMIN_VIEW_SERVER: 'admin:view_server',
  ADMIN_SUSPEND_SERVER: 'admin:suspend_server',
  ADMIN_UNSUSPEND_SERVER: 'admin:unsuspend_server',
  ADMIN_STOP_SERVER: 'admin:stop_server',
  ADMIN_FORCE_EXPIRE: 'admin:force_expire',
  ADMIN_DELETE_SERVER: 'admin:delete_server',
  ADMIN_LIST_USERS: 'admin:list_users',
  ADMIN_VIEW_USER: 'admin:view_user',
  ADMIN_TOGGLE_RESTRICTION: 'admin:toggle_restriction',
  ADMIN_TOGGLE_AUTH_RESTRICTION: 'admin:toggle_auth_restriction',
  ADMIN_TOGGLE_ADMIN: 'admin:toggle_admin',
  ADMIN_NOTIFY_USER: 'admin:notify_user',
  ADMIN_NOTIFY_ALL: 'admin:notify_all',
  ADMIN_DELETE_USER: 'admin:delete_user',
  ADMIN_VIEW_STATS: 'admin:view_stats',
  ADMIN_VIEW_ACTIVITY: 'admin:view_activity',
  ADMIN_MANAGE_NESTS: 'admin:manage_nests',
  ADMIN_MANAGE_EGGS: 'admin:manage_eggs',
};

export const ROLE_PERMISSIONS = {
  [ROLES.USER]: [
    PERMISSIONS.SERVER_CREATE,
    PERMISSIONS.SERVER_RENEW,
    PERMISSIONS.SERVER_RENAME,
    PERMISSIONS.SERVER_REINSTALL,
    PERMISSIONS.SERVER_DELETE,
    PERMISSIONS.SERVER_POWER,
    PERMISSIONS.SERVER_LIST,
    PERMISSIONS.SERVER_DETAILS,
    PERMISSIONS.SERVER_OVERVIEW,
    PERMISSIONS.API_KEY_READ,
    PERMISSIONS.API_KEY_WRITE,
    PERMISSIONS.API_KEY_DELETE,
    PERMISSIONS.ACCOUNT_CHANGE_PASSWORD,
    PERMISSIONS.ACCOUNT_CHANGE_EMAIL,
    PERMISSIONS.ACCOUNT_DELETE,
    PERMISSIONS.ACCOUNT_EXPORT_DATA,
    PERMISSIONS.ACCOUNT_UPLOAD_AVATAR,
    PERMISSIONS.ACCOUNT_VIEW_AVATAR,
    PERMISSIONS.NOTIFICATION_LIST,
    PERMISSIONS.NOTIFICATION_READ,
    PERMISSIONS.NOTIFICATION_READ_ALL,
    PERMISSIONS.ACTIVITY_LIST,
  ],
  [ROLES.ADMIN]: [
    // Admin inherits all user permissions + admin-specific ones
    PERMISSIONS.ADMIN_LOGIN,
    PERMISSIONS.ADMIN_CHECK,
    PERMISSIONS.ADMIN_LIST_SERVERS,
    PERMISSIONS.ADMIN_VIEW_SERVER,
    PERMISSIONS.ADMIN_SUSPEND_SERVER,
    PERMISSIONS.ADMIN_UNSUSPEND_SERVER,
    PERMISSIONS.ADMIN_STOP_SERVER,
    PERMISSIONS.ADMIN_FORCE_EXPIRE,
    PERMISSIONS.ADMIN_DELETE_SERVER,
    PERMISSIONS.ADMIN_LIST_USERS,
    PERMISSIONS.ADMIN_VIEW_USER,
    PERMISSIONS.ADMIN_TOGGLE_RESTRICTION,
    PERMISSIONS.ADMIN_TOGGLE_AUTH_RESTRICTION,
    PERMISSIONS.ADMIN_TOGGLE_ADMIN,
    PERMISSIONS.ADMIN_NOTIFY_USER,
    PERMISSIONS.ADMIN_NOTIFY_ALL,
    PERMISSIONS.ADMIN_DELETE_USER,
    PERMISSIONS.ADMIN_VIEW_STATS,
    PERMISSIONS.ADMIN_VIEW_ACTIVITY,
    PERMISSIONS.ADMIN_MANAGE_NESTS,
    PERMISSIONS.ADMIN_MANAGE_EGGS,
  ],
};

export function hasPermission(user, permission) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return ROLE_PERMISSIONS[ROLES.USER].includes(permission);
}
