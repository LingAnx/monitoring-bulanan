// ============================================================
// SECURITY-CHECK — validasi konfigurasi startup (fail-fast)
// Jalankan sebelum app: node scripts/security-check.js
// Dipanggil otomatis oleh server.js saat startup.
// ============================================================
const { logger } = require('../middleware/logger');

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// Placeholder yang ditolak di production
const PLACEHOLDER_SECRETS = [
  'your_jwt_secret_here',
  'your_password_here',
  'changeme',
  'password',
];

const SECRET_GEN_HINT = "node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"";

function fail(message) {
  logger.error('[SECURITY-CHECK] FATAL: ' + message);
  process.exit(1);
}

// ── 1. Validasi JWT_SECRET ──────────────────────────────────
const jwtSecret = process.env.JWT_SECRET || '';

if (jwtSecret.length === 0) {
  fail('JWT_SECRET tidak diset. Aplikasi tidak dapat start tanpa JWT_SECRET. ' +
       'Generate secret baru: ' + SECRET_GEN_HINT);
}

if (jwtSecret.length < 32) {
  fail('JWT_SECRET terlalu pendek (' + jwtSecret.length + ' karakter, minimum 32). ' +
       'Gunakan: ' + SECRET_GEN_HINT);
}

if (IS_PRODUCTION) {
  const lower = jwtSecret.toLowerCase();
  for (const placeholder of PLACEHOLDER_SECRETS) {
    if (lower.includes(placeholder)) {
      fail('JWT_SECRET masih berupa placeholder di mode production. Ganti dengan secret acak yang kuat.');
    }
  }
}

// ── 2. Validasi DB_PASSWORD ─────────────────────────────────
const dbPassword = process.env.DB_PASSWORD || '';

if (dbPassword.length === 0 && IS_PRODUCTION) {
  fail('DB_PASSWORD tidak diset di mode production. Set DB_PASSWORD di environment.');
}

if (IS_PRODUCTION && dbPassword !== '') {
  const lowerPw = dbPassword.toLowerCase();
  for (const placeholder of PLACEHOLDER_SECRETS) {
    if (lowerPw.includes(placeholder)) {
      fail('DB_PASSWORD masih berupa placeholder di mode production. Ganti dengan password database yang kuat.');
    }
  }
}

logger.info('[SECURITY-CHECK] Konfigurasi aman: JWT_SECRET valid, DB kredensial OK.',
  { nodeEnv: NODE_ENV, jwtSecretLength: jwtSecret.length });

module.exports = { validate: true };
