// ══════════════════════════════════════════════════
// SUPPORTED BOOTSTRAP UTILITY — setup-admin.js
// Creates or updates a single SUPERADMIN user.
//
// Usage (via CLI args):
//   npm run setup-admin -- <username> <password> [nama]
//
// Usage (via env vars, password preferred from env):
//   ADMIN_USERNAME=admin ADMIN_PASSWORD=... npm run setup-admin
//
// Password MUST be provided explicitly (arg or env).
// No default/fallback password is used.
// Password is never printed to the console.
// ══════════════════════════════════════════════════
const bcrypt = require('bcrypt');
const pool = require('../db/database');

const MIN_PW_LEN = 12;

function fail(msg) {
  console.error(`[setup-admin] ERROR: ${msg}`);
  process.exit(1);
}

async function setupAdmin() {
  try {
    // ── Resolve username ────────────────────────────────────
    const username = process.argv[2] || process.env.ADMIN_USERNAME || 'admin';

    // ── Resolve password: env var takes precedence over CLI arg
    //    No default value. Fails hard if missing or too short.
    const password = process.env.ADMIN_PASSWORD || process.argv[3];
    if (!password) {
      fail('Password wajib diberikan. Gunakan env var ADMIN_PASSWORD atau arg CLI kedua: npm run setup-admin -- <username> <password> [nama]');
    }
    if (password.length < MIN_PW_LEN) {
      fail(`Password minimal ${MIN_PW_LEN} karakter. Password yang diberikan terlalu pendek.`);
    }

    const nama = process.argv[4] || process.env.ADMIN_NAMA || 'Administrator';

    console.log('[setup-admin] Setting up SUPERADMIN user...');
    console.log(`[setup-admin] Username: ${username}`);
    console.log(`[setup-admin] Nama:     ${nama}`);

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1', [username]
    );

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    if (existingUser.rows.length > 0) {
      await pool.query(
        `UPDATE users SET password = $1, nama = $2, role = $3 WHERE username = $4`,
        [hashedPassword, nama, 'SUPERADMIN', username]
      );
      console.log('[setup-admin] User sudah ada → password & role diperbarui ke SUPERADMIN.');
    } else {
      await pool.query(
        `INSERT INTO users (username, password, nama, role)
         VALUES ($1, $2, $3, $4)`,
        [username, hashedPassword, nama, 'SUPERADMIN']
      );
      console.log('[setup-admin] User baru dibuat → role SUPERADMIN.');
    }

    // Password NOT printed. Only username & role.
    console.log('\n[setup-admin] Selesai.');
    console.log(`   Username: ${username}`);
    console.log(`   Role:     SUPERADMIN`);
    console.log(`   Password: (tidak ditampilkan — set via env/CLI)`);

    process.exit(0);
  } catch (error) {
    fail(error.message || String(error));
  }
}

setupAdmin();
