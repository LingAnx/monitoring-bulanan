// ============================================================
// test-jwt-rotation.js
// Test otomatis untuk memverifikasi:
//   1. Aplikasi menolak startup tanpa JWT_SECRET
//   2. Token lama (secret lama) ditolak setelah rotasi secret
//   3. Token baru (secret baru) diterima
//
// Cara menjalankan:
//   cd backend && node tests/test-jwt-rotation.js
// ============================================================
const { execSync } = require('child_process');
const path = require('path');
const assert = require('assert');

// Tidak bergantung pada app — test standalone pakai jsonwebtoken
// (jsonwebtoken sudah ada di node_modules backend)
const jwt = require(path.join(__dirname, '..', 'node_modules', 'jsonwebtoken'));

const OLD_SECRET = 'old_secret_abcdef_1234567890_abcdef1234567890';  // 32+ chars
const NEW_SECRET = 'new_secret_zyxwv_9876543210_zxwv9876543210zxwv9876';

let passed = 0;
let failed = 0;

function report(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${e.message}`);
    failed++;
  }
}

console.log('\n=== TEST: JWT Rotation Security ===\n');

// ── Test 1: Token ditandatangani secret lama, divalidasi secret baru ──
report('Token lama (secret lama) ditolak setelah rotasi secret', () => {
  const token = jwt.sign({ userId: 1, role: 'SUPERADMIN' }, OLD_SECRET, { expiresIn: '1h' });
  // Simulasi: server sekarang pakai NEW_SECRET
  let result = null;
  try {
    result = jwt.verify(token, NEW_SECRET);
  } catch (e) {
    result = null; // ditolak — expected
  }
  assert.strictEqual(result, null,
    'Token lama seharusnya DITOLAK setelah secret berubah, tapi ternyata lolos.');
});

// ── Test 2: Token baru (secret baru) diterima ───────────────
report('Token baru (secret baru) diterima', () => {
  const token = jwt.sign({ userId: 1, role: 'SUPERADMIN' }, NEW_SECRET, { expiresIn: '1h' });
  const decoded = jwt.verify(token, NEW_SECRET);
  assert.strictEqual(decoded.userId, 1);
  assert.strictEqual(decoded.role, 'SUPERADMIN');
});

// ── Test 3: Token expired ditolak ───────────────────────────
report('Token yang sudah expired ditolak', () => {
  const token = jwt.sign({ userId: 1 }, NEW_SECRET, { expiresIn: '-1s' });
  let threw = false;
  try {
    jwt.verify(token, NEW_SECRET);
  } catch (e) {
    if (e.name === 'TokenExpiredError') threw = true;
  }
  assert.ok(threw, 'Token expired seharusnya ditolak dengan TokenExpiredError.');
});

// ── Test 4: security-check menolak JWT_SECRET kosong (spawn process) ──
report('Aplikasi menolak startup ketika JWT_SECRET kosong (spawed process)', () => {
  const backendDir = path.join(__dirname, '..');
  const scriptPath = path.join(backendDir, 'scripts', 'security-check.js');
  let exitCode;
  let stdout = '';
  let stderr = '';
  try {
  const result = execSync(
    `node "${scriptPath}"`,
    {
      cwd: backendDir,
      env: {
        ...process.env,
        JWT_SECRET: '',
        NODE_ENV: 'development',
      },
      encoding: 'utf8',
      timeout: 10000,
    });
  stdout = result;
  exitCode = 0;
  } catch (e) {
  exitCode = e.status;
  stdout = e.stdout || '';
  stderr = e.stderr || '';
  }
  const combined = (stdout + stderr);
  assert.notStrictEqual(exitCode, 0,
  'Proses security-check harus keluar dengan exit code != 0 ketika JWT_SECRET kosong.');
  assert.ok(
  combined.includes('JWT_SECRET') || combined.includes('FATAL') || combined.includes('tidak diset'),
  'Output error harus menyebut JWT_SECRET.'
  );
});

// ── Test 5: security-check menolak JWT_SECRET terlalu pendek ──
report('Aplikasi menolak JWT_SECRET yang terlalu pendek (< 32 char)', () => {
  const backendDir = path.join(__dirname, '..');
  const scriptPath = path.join(backendDir, 'scripts', 'security-check.js');
  let exitCode;
  try {
    execSync(
      `node "${scriptPath}"`,
      {
        cwd: backendDir,
        env: {
          ...process.env,
          JWT_SECRET: 'short_secret_too_short',  // 24 chars
          NODE_ENV: 'development',
        },
        encoding: 'utf8',
        timeout: 10000,
      });
    exitCode = 0;
  } catch (e) {
    exitCode = e.status;
  }
  assert.notStrictEqual(exitCode, 0,
    'JWT_SECRET pendek harus ditolak.');
});

// ── Test 6: security-check menerima JWT_SECRET valid ────────
report('Aplikasi menerima JWT_SECRET valid (>= 32 char)', () => {
  const backendDir = path.join(__dirname, '..');
  const scriptPath = path.join(backendDir, 'scripts', 'security-check.js');
  let exitCode;
  try {
    execSync(
      `node "${scriptPath}"`,
      {
        cwd: backendDir,
        env: {
          ...process.env,
          JWT_SECRET: 'valid_secret_abcdef_123456789012345678901234',  // 44 chars
          NODE_ENV: 'development',
        },
        encoding: 'utf8',
        timeout: 10000,
      });
    exitCode = 0;
  } catch (e) {
    exitCode = e.status;
  }
  assert.strictEqual(exitCode, 0,
    'JWT_SECRET valid seharusnya membuat security-check lolos (exit 0).');
});

// ── Test 7: production menolak placeholder JWT_SECRET ──────
report('Mode production menolak JWT_SECRET berupa placeholder', () => {
  const backendDir = path.join(__dirname, '..');
  const scriptPath = path.join(backendDir, 'scripts', 'security-check.js');
  let exitCode;
  try {
    execSync(
      `node "${scriptPath}"`,
      {
        cwd: backendDir,
        env: {
          ...process.env,
          JWT_SECRET: 'your_jwt_secret_here_padding_padding_padding',  // contains placeholder
          NODE_ENV: 'production',
          DB_PASSWORD: 'realpassword123',
        },
        encoding: 'utf8',
        timeout: 10000,
      });
    exitCode = 0;
  } catch (e) {
    exitCode = e.status;
  }
  assert.notStrictEqual(exitCode, 0,
    'JWT_SECRET placeholder di production harus ditolak.');
});

// ── Test 8: production menolak DB_PASSWORD placeholder ─────
report('Mode production menolak DB_PASSWORD berupa placeholder', () => {
  const backendDir = path.join(__dirname, '..');
  const scriptPath = path.join(backendDir, 'scripts', 'security-check.js');
  let exitCode;
  try {
    execSync(
      `node "${scriptPath}"`,
      {
        cwd: backendDir,
        env: {
          ...process.env,
          JWT_SECRET: 'valid_secret_abcdef_123456789012345678901234',
          NODE_ENV: 'production',
          DB_PASSWORD: 'your_password_here',
        },
        encoding: 'utf8',
        timeout: 10000,
      });
    exitCode = 0;
  } catch (e) {
    exitCode = e.status;
  }
  assert.notStrictEqual(exitCode, 0,
    'DB_PASSWORD placeholder di production harus ditolak.');
});

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed, ${passed + failed} total ===`);
process.exit(failed > 0 ? 1 : 0);
