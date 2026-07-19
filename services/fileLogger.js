import { appendFile, access, constants, readFile, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = resolve(__dirname, '..', 'log.txt');

const actionLabels = [
  // Auth
  { pattern: /^GET \/api\/auth\/onboarding-status$/, label: 'Statut d\'onboarding' },
  { pattern: /^POST \/api\/auth\/complete-onboarding$/, label: 'Fin d\'onboarding' },
  { pattern: /^POST \/api\/auth\/register$/, label: 'Inscription' },
  { pattern: /^POST \/api\/auth\/login$/, label: 'Connexion' },
  { pattern: /^POST \/api\/auth\/logout$/, label: 'Déconnexion' },
  { pattern: /^POST \/api\/auth\/change-password$/, label: 'Changement de mot de passe' },
  { pattern: /^POST \/api\/auth\/change-email$/, label: 'Demande de changement d\'email' },
  { pattern: /^GET \/api\/auth\/change-email\/verify$/, label: 'Vérification de changement d\'email' },
  { pattern: /^POST \/api\/auth\/change-email\/confirm$/, label: 'Confirmation de changement d\'email' },
  { pattern: /^POST \/api\/auth\/delete-account$/, label: 'Suppression de compte' },
  { pattern: /^GET \/api\/auth\/check-availability$/, label: 'Vérification de disponibilité' },
  { pattern: /^GET \/api\/auth\/check-vpn$/, label: 'Vérification VPN' },
  { pattern: /^GET \/api\/auth\/verify-email$/, label: 'Vérification d\'email' },
  { pattern: /^POST \/api\/auth\/resend-verification$/, label: 'Renvoi de vérification d\'email' },
  { pattern: /^GET \/api\/auth\/export-data$/, label: 'Export de données' },

  // Passkeys
  { pattern: /^POST \/api\/auth\/passkeys\/register\/begin$/, label: 'Début d\'enregistrement de passkey' },
  { pattern: /^POST \/api\/auth\/passkeys\/register\/complete$/, label: 'Enregistrement de passkey' },
  { pattern: /^POST \/api\/auth\/passkeys\/login\/begin$/, label: 'Début de connexion par passkey' },
  { pattern: /^POST \/api\/auth\/passkeys\/login\/complete$/, label: 'Connexion par passkey' },
  { pattern: /^GET \/api\/auth\/passkeys$/, label: 'Liste des passkeys' },
  { pattern: /^DELETE \/api\/auth\/passkeys\/\d+$/, label: 'Suppression de passkey' },

  // TOTP
  { pattern: /^GET \/api\/auth\/totp\/status$/, label: 'Statut TOTP' },
  { pattern: /^POST \/api\/auth\/totp\/setup$/, label: 'Configuration TOTP' },
  { pattern: /^POST \/api\/auth\/totp\/enable$/, label: 'Activation TOTP' },
  { pattern: /^POST \/api\/auth\/totp\/disable$/, label: 'Désactivation TOTP' },
  { pattern: /^POST \/api\/auth\/totp\/verify$/, label: 'Vérification TOTP' },
  { pattern: /^POST \/api\/auth\/totp\/recovery$/, label: 'Code de récupération TOTP' },
  { pattern: /^GET \/api\/auth\/totp\/recovery-codes$/, label: 'Codes de récupération TOTP' },
  { pattern: /^POST \/api\/auth\/totp\/recovery-codes\/regenerate$/, label: 'Régénération de codes TOTP' },

  // Servers
  { pattern: /^GET \/api\/servers\/list$/, label: 'Liste des serveurs' },
  { pattern: /^GET \/api\/servers\/nests$/, label: 'Liste des nests' },
  { pattern: /^GET \/api\/servers\/eggs$/, label: 'Liste des eggs' },
  { pattern: /^GET \/api\/servers\/overview$/, label: 'Aperçu des serveurs' },
  { pattern: /^POST \/api\/servers\/create$/, label: 'Création de serveur' },
  { pattern: /^GET \/api\/servers\/details\/\d+$/, label: 'Détails du serveur' },
  { pattern: /^POST \/api\/servers\/renew\/\d+$/, label: 'Renouvellement de serveur' },
  { pattern: /^PATCH \/api\/servers\/\d+$/, label: 'Renommage de serveur' },
  { pattern: /^POST \/api\/servers\/\d+\/reinstall$/, label: 'Réinstallation de serveur' },
  { pattern: /^DELETE \/api\/servers\/\d+$/, label: 'Suppression de serveur' },
  { pattern: /^POST \/api\/servers\/power\/[A-Za-z0-9]+$/, label: 'Action d\'alimentation du serveur' },
  { pattern: /^GET \/api\/servers\/client-api-key$/, label: 'Vérification de clé API' },
  { pattern: /^PUT \/api\/servers\/client-api-key$/, label: 'Mise à jour de clé API' },
  { pattern: /^DELETE \/api\/servers\/client-api-key$/, label: 'Suppression de clé API' },

  // Admin - Auth
  { pattern: /^POST \/api\/admin\/login$/, label: 'Connexion admin' },
  { pattern: /^GET \/api\/admin\/check$/, label: 'Vérification admin' },

  // Admin - Servers
  { pattern: /^GET \/api\/admin\/servers$/, label: 'Liste des serveurs (admin)' },
  { pattern: /^GET \/api\/admin\/servers\/\d+$/, label: 'Détails du serveur (admin)' },
  { pattern: /^POST \/api\/admin\/servers\/\d+\/suspend$/, label: 'Suspension de serveur (admin)' },
  { pattern: /^POST \/api\/admin\/servers\/\d+\/unsuspend$/, label: 'Réactivation de serveur (admin)' },
  { pattern: /^POST \/api\/admin\/servers\/\d+\/stop$/, label: 'Arrêt de serveur (admin)' },
  { pattern: /^POST \/api\/admin\/servers\/\d+\/renew-now$/, label: 'Expiration forcée de serveur (admin)' },
  { pattern: /^DELETE \/api\/admin\/servers\/\d+$/, label: 'Suppression de serveur (admin)' },

  // Admin - Nodes
  { pattern: /^GET \/api\/admin\/nodes$/, label: 'Liste des nodes (admin)' },
  { pattern: /^GET \/api\/admin\/nodes\/\d+$/, label: 'Détails du node (admin)' },
  { pattern: /^GET \/api\/admin\/nodes\/\d+\/allocations$/, label: 'Allocations du node (admin)' },
  { pattern: /^GET \/api\/admin\/nodes\/\d+\/servers$/, label: 'Serveurs du node (admin)' },
  { pattern: /^GET \/api\/admin\/nodes\/\d+\/settings$/, label: 'Paramètres du node (admin)' },
  { pattern: /^PUT \/api\/admin\/nodes\/\d+\/settings$/, label: 'Modification des paramètres du node (admin)' },
  { pattern: /^GET \/api\/admin\/nodes\/unavailable$/, label: 'Nodes indisponibles (admin)' },

  // Admin - Users
  { pattern: /^GET \/api\/admin\/users$/, label: 'Liste des utilisateurs (admin)' },
  { pattern: /^GET \/api\/admin\/users\/\d+$/, label: 'Détails de l\'utilisateur (admin)' },
  { pattern: /^POST \/api\/admin\/users\/\d+\/toggle-restriction$/, label: 'Restriction d\'utilisateur (admin)' },
  { pattern: /^POST \/api\/admin\/users\/\d+\/toggle-auth-restriction$/, label: 'Restriction d\'auth (admin)' },
  { pattern: /^POST \/api\/admin\/users\/\d+\/toggle-admin$/, label: 'Changement de rôle admin (admin)' },
  { pattern: /^POST \/api\/admin\/users\/\d+\/notify$/, label: 'Notification à un utilisateur (admin)' },
  { pattern: /^POST \/api\/admin\/notify-all$/, label: 'Notification à tous (admin)' },
  { pattern: /^DELETE \/api\/admin\/users\/\d+$/, label: 'Suppression d\'utilisateur (admin)' },

  // Admin - Stats & Activity
  { pattern: /^GET \/api\/admin\/stats$/, label: 'Statistiques (admin)' },
  { pattern: /^GET \/api\/admin\/activity$/, label: 'Journal d\'activité (admin)' },

  // Admin - Settings Nests
  { pattern: /^GET \/api\/admin\/settings\/nests$/, label: 'Paramètres des nests (admin)' },
  { pattern: /^GET \/api\/admin\/settings\/nests\/available$/, label: 'Nests disponibles (admin)' },
  { pattern: /^POST \/api\/admin\/settings\/nests$/, label: 'Ajout de nest (admin)' },
  { pattern: /^PUT \/api\/admin\/settings\/nests\/\d+$/, label: 'Modification de nest (admin)' },
  { pattern: /^DELETE \/api\/admin\/settings\/nests\/\d+$/, label: 'Suppression de nest (admin)' },

  // Admin - Settings Eggs
  { pattern: /^GET \/api\/admin\/settings\/nests\/\d+\/eggs$/, label: 'Eggs du nest (admin)' },
  { pattern: /^GET \/api\/admin\/settings\/eggs\/\d+\/\d+$/, label: 'Paramètres de l\'egg (admin)' },
  { pattern: /^PUT \/api\/admin\/settings\/eggs\/\d+\/\d+$/, label: 'Modification de l\'egg (admin)' },
  { pattern: /^POST \/api\/admin\/settings\/eggs\/\d+\/\d+\/apply-all$/, label: 'Appliquer ressources à tous (admin)' },

  // Notifications
  { pattern: /^GET \/api\/notifications\/$/, label: 'Liste des notifications' },
  { pattern: /^GET \/api\/notifications\/unread-count$/, label: 'Notifications non lues' },
  { pattern: /^PATCH \/api\/notifications\/\d+\/read$/, label: 'Marquer notification comme lue' },
  { pattern: /^PATCH \/api\/notifications\/read-all$/, label: 'Marquer toutes les notifications comme lues' },

  // General
  { pattern: /^GET \/api\/activity$/, label: 'Journal d\'activité' },
  { pattern: /^GET \/api\/health$/, label: 'Vérification de santé' },
  { pattern: /^GET \/api\/config$/, label: 'Configuration' },
];

function getActionLabel(method, path) {
  const key = `${method} ${path}`;
  for (const { pattern, label } of actionLabels) {
    if (pattern.test(key)) return label;
  }
  return null;
}

export async function ensureLogFile() {
  try {
    await access(LOG_FILE, constants.F_OK);
  } catch {
    await appendFile(LOG_FILE, '', 'utf-8');
    console.log('Created log.txt');
  }
}

const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

export async function cleanOldLogs() {
  try {
    const content = await readFile(LOG_FILE, 'utf-8');
    if (!content) return;
    const cutoff = Date.now() - ONE_YEAR;
    const lines = content.split('\n').filter(line => {
      if (!line.trim()) return false;
      const match = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
      if (!match) return true;
      const ts = new Date(match[1].replace(' ', 'T') + 'Z').getTime();
      return ts >= cutoff;
    });
    const cleaned = lines.join('\n') + (lines.length > 0 ? '\n' : '');
    await writeFile(LOG_FILE, cleaned, 'utf-8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Failed to clean old logs:', err.message);
    }
  }
}

export function startLogCleaner() {
  cleanOldLogs();
  setInterval(cleanOldLogs, 24 * 60 * 60 * 1000);
}

export async function writeLog(method, path, ip) {
  const label = getActionLabel(method, path);
  const date = new Date();
  const timestamp = date.toISOString().replace('T', ' ').slice(0, 19);
  const desc = label ? ` (${label})` : '';
  const line = `[${timestamp}] ${method} ${path}${desc} - ${ip}\n`;
  try {
    await appendFile(LOG_FILE, line, 'utf-8');
  } catch (err) {
    console.error('Failed to write to log.txt:', err.message);
  }
}
