const { Pool } = require('pg');
require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// ── Helper: tolak placeholder di production ─────────────────
function checkPlaceholder(value, varName, defaultValue) {
  if (IS_PRODUCTION && value === defaultValue) {
    // Hanya production; development boleh pakai default
  }
  if (IS_PRODUCTION && (value === 'your_password_here' || value === 'your_jwt_secret_here')) {
    console.error(`FATAL: ${varName} masih berupa placeholder di production. Set nilai yang valid di environment.`);
    process.exit(1);
  }
}

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_NAME = process.env.DB_NAME || 'ksop_laporan';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

checkPlaceholder(DB_PASSWORD, 'DB_PASSWORD');

if (IS_PRODUCTION && DB_PASSWORD === '') {
  console.error('FATAL: DB_PASSWORD tidak diset di mode production. Aplikasi tidak dapat start.');
  process.exit(1);
}

const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
});

pool.on('connect', () => {
  console.log('[DB] Terhubung ke PostgreSQL');
});

pool.on('error', (err) => {
  // Jangan log detail koneksi (bisa mengandung kredensial)
  console.error('[DB] Error pada koneksi idle:', err.message);
  process.exit(-1);
});

module.exports = pool;
