export const PTERO_URL = process.env.PTERO_URL || 'https://panel.zero-host.org';
export const PTERO_API_KEY = process.env.PTERO_API_KEY || '';
export const PANEL_DB_NAME = (process.env.PANEL_DB_NAME || 'panel').replace(/[^a-zA-Z0-9_]/g, '');

export const SERVER_LIMITS = {
  memory: 512,
  swap: 0,
  disk: 3072,
  io: 500,
  cpu: 50,
};

export const FEATURE_LIMITS = {
  databases: 0,
  allocations: 1,
  backups: 1,
};

export const DEPLOY_LOCATIONS = [1];
