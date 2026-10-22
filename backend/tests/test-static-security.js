// ============================================================
// test-static-security.js
// Test keamanan static serving:
//   - file internal tidak dapat diakses
//   - file publik dapat diakses
//   - path traversal ditolak
//   - API 404 menghasilkan JSON, bukan HTML
//
// Cara menjalankan:
//   cd backend && JWT_SECRET=<valid> node tests/test-static-security.js
// ============================================================
const http = require('http');
const { execSync } = require('child_process');
const path = require('path');
const assert = require('assert');

const PORT = 4444; // port test
const BASE = `http://127.0.0.1:${PORT}`;

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

// Helper: GET request, return { status, body, headers }
function get(urlPath, raw = false) {
  return new Promise((resolve, reject) => {
    const url = raw ? urlPath : BASE + urlPath;
    http.get(url, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

// Helper: GET with encoded path (use raw URL to bypass Express decoding)
function getEncoded(encodedPath) {
  return new Promise((resolve, reject) => {
    http.get(BASE + encodedPath, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

async function main() {
  // ── Mulai server test ─────────────────────────────────
  console.log('\n=== TEST: Static File Security ===\n');

  // Set env vars untuk test
  process.env.JWT_SECRET = 'test_secret_abc_12345678901234567890123456';
  process.env.NODE_ENV = 'development';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '9999'; // port tidak ada — DB tidak dibutuhkan untuk test static
  process.env.DB_NAME = 'test_db';
  process.env.DB_USER = 'test_user';
  process.env.DB_PASSWORD = 'test_pw';
  process.env.PORT = String(PORT);

  // server.js akan exit jika DB tidak connect — kita pakai app() tanpa listen
  // Jadi kita import langsung express app dengan setup yang sama
  const { app } = buildTestApp();

  const server = await new Promise((resolve, reject) => {
    const srv = app.listen(PORT, () => resolve(srv));
    srv.on('error', reject);
  });

  try {
    // ════════════════════════════════════════════════════════
    // A. FILE INTERNAL — harus 404 atau 403
    // ════════════════════════════════════════════════════════
    console.log('--- File Internal (harus 404/403) ---');

    const internalPaths = [
      '/.env',
      '/.git/config',
      '/.git',
      '/backend/server.js',
      '/backend/package.json',
      '/backend/.env.example',
      '/backend/db/schema.sql',
      '/backend/db/migrations/005_add_must_change_password.sql',
      '/backend/logs/error.log',
      '/backend/uploads',
      '/backend/scripts/setup-seed.js',
      '/backend/node_modules/express/package.json',
      '/ksop_laporan_v1_stable.sql',
      '/CHANGELOG_FIXES.md',
      '/STABILITY_ANALYSIS.md',
      '/RDP.md',
      '/scripts/build-release.sh',
      '/scripts/sync-frontend.sh',
      '/.DS_Store',
      '/db/schema.sql',
      '/middleware/auth.js',
      '/routes/auth.js',
      '/uploads',
      '/handoffs/test.md',
    ];

    for (const p of internalPaths) {
      const name = p;
      report(`Internal: GET ${p} → 404/403`, async () => {
        const r = await get(p);
        const ok = r.status === 404 || r.status === 403 || r.status === 400;
        assert.ok(ok, `Status ${r.status} (expected 404/403/400)`);
        // Body tidak boleh mengandung isi file sensitif
        assert.ok(!r.body.includes('JWT_SECRET='), 'Body mengandung isi .env');
        assert.ok(!r.body.includes('require(') || r.status >= 400, 'Body mungkin mengandung source JS backend');
      });
    }

    // ════════════════════════════════════════════════════════
    // B. FILE PUBLIK — harus 200
    // ════════════════════════════════════════════════════════
    console.log('\n--- File Publik (harus 200) ---');

    const publicPaths = [
      '/index.html',
      '/login.html',
      '/style.css',
      '/login.css',
      '/dashboard.css',
      '/js/auth/auth-store.js',
      '/js/auth/role-guard.js',
      '/app.js',
      '/translations.js',
      '/employee/dashboard.html',
      '/admin-section/dashboard.html',
      '/head-office/dashboard.html',
      '/superadmin/dashboard.html',
      '/js/layouts/employee-layout.js',
      '/employee/_layout.js',
    ];

    for (const p of publicPaths) {
      const name = `Publik: GET ${p} → 200`;
      report(name, async () => {
        const r = await get(p);
        assert.strictEqual(r.status, 200, `Status ${r.status}, body: ${r.body.substring(0, 80)}`);
        assert.ok(r.body.length > 0, 'Body kosong');
      });
    }

    // Cek Content-Type untuk CSS
    report('Content-Type CSS benar', async () => {
      const r = await get('/style.css');
      const ct = r.headers['content-type'] || '';
      assert.ok(ct.includes('text/css'), `Content-Type: ${ct}`);
    });

    report('Content-Type JS benar', async () => {
      const r = await get('/app.js');
      const ct = r.headers['content-type'] || '';
      assert.ok(ct.includes('javascript'), `Content-Type: ${ct}`);
    });

    report('Content-Type HTML benar', async () => {
      const r = await get('/index.html');
      const ct = r.headers['content-type'] || '';
      assert.ok(ct.includes('text/html'), `Content-Type: ${ct}`);
    });

    // ════════════════════════════════════════════════════════
    // C. PATH TRAVERSAL
    // ════════════════════════════════════════════════════════
    console.log('\n--- Path Traversal (harus 400/403/404) ---');

    const traversalPaths = [
      // URL-encoded variants
      '/%2e%2e/backend/server.js',
      '/%2e%2e%2fbackend%2fserver.js',
      '/..%2fbackend%2fserver.js',
      '/..%5C..%5Cbackend%5Cserver.js',
      '/public/../backend/server.js',
      '/backend%2fserver.js',
      '/.%2e/backend/server.js',
      '/.env%00.jpg',           // null byte
      '/backend/server.js',     // plain (sudah di atas, tapi ulang di sini)
      '/%2e%2e/.env',
      '/%2e%2e%2e/backend/server.js',
      // Double-encoded
      '/%252e%252e/backend/server.js',
      '/%252e%252e%252fbackend%252fserver.js',
      // Mixed
      '/../backend/server.js',
      '/../../etc/passwd',
      '/backend/../../backend/server.js',
    ];

    for (const p of traversalPaths) {
      const name = `Traversal: GET ${p} → 400/403/404`;
      report(name, async () => {
        const r = await getEncoded(p);
        const ok = [400, 403, 404].includes(r.status);
        assert.ok(ok, `Status ${r.status} (expected 400/403/404), body: ${r.body.substring(0, 100)}`);
        // Tidak boleh ada isi backend/server.js
        assert.ok(!r.body.includes('require(\'express\')') && !r.body.includes('require("express")'),
          'Body mengandung isi backend/server.js');
        // Tidak boleh ada absolute path
        assert.ok(!r.body.includes('/Users/'), 'Body mengandung absolute path lokal');
      });
    }

    // ════════════════════════════════════════════════════════
    // D. API 404 — harus JSON, bukan HTML
    // ════════════════════════════════════════════════════════
    console.log('\n--- API 404 (harus JSON, bukan HTML) ---');

    report('GET /api/nonexistent → JSON 404', async () => {
      const r = await get('/api/nonexistent');
      assert.strictEqual(r.status, 404, `Status ${r.status}`);
      const ct = r.headers['content-type'] || '';
      assert.ok(ct.includes('application/json'), `Content-Type: ${ct} (expected application/json)`);
      const parsed = JSON.parse(r.body);
      assert.strictEqual(parsed.success, false);
    });

    report('GET /api/laporan (tanpa token) → 401 JSON', async () => {
      const r = await get('/api/laporan');
      assert.strictEqual(r.status, 401, `Status ${r.status}`);
      const ct = r.headers['content-type'] || '';
      assert.ok(ct.includes('application/json'), `Content-Type: ${ct}`);
    });

    // ════════════════════════════════════════════════════════
    // E. SECURITY HEADERS
    // ════════════════════════════════════════════════════════
    console.log('\n--- Security Headers ---');

    report('X-Content-Type-Options: nosniff ada', async () => {
      const r = await get('/index.html');
      assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
    });

    report('X-Frame-Options: DENY ada', async () => {
      const r = await get('/index.html');
      assert.strictEqual(r.headers['x-frame-options'], 'DENY');
    });

    report('Referrer-Policy ada', async () => {
      const r = await get('/index.html');
      assert.ok(r.headers['referrer-policy'], 'Referrer-Policy header tidak ada');
    });

    report('Content-Security-Policy ada', async () => {
      const r = await get('/index.html');
      assert.ok(r.headers['content-security-policy'], 'CSP header tidak ada');
    });

    report('Cache-Control untuk .html = no-cache', async () => {
      const r = await get('/index.html');
      assert.ok((r.headers['cache-control'] || '').includes('no-cache'),
        `Cache-Control: ${r.headers['cache-control']}`);
    });

    report('Cache-Control untuk .css = public', async () => {
      const r = await get('/style.css');
      assert.ok((r.headers['cache-control'] || '').includes('public'),
        `Cache-Control: ${r.headers['cache-control']}`);
    });

  } finally {
    server.close();
  }

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed, ${passed + failed} total ===`);
  process.exit(failed > 0 ? 1 : 0);
}

// ── Build test app ────────────────────────────────────────────
function buildTestApp() {
  // Re-eksekusi setup server.js tanpa DB
  const express = require('express');
  const cors = require('cors');
  const rateLimit = require('express-rate-limit');
  const pathMod = require('path');

  const { staticGuard, cacheHeaders, securityHeaders } = require('../middleware/static-guard');
  const { requestLogger } = require('../middleware/logger');
  const authRoutes = require('../routes/auth');
  const laporanRoutes = require('../routes/laporan');

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(securityHeaders);
  app.use(requestLogger);

  const publicDir = pathMod.resolve(__dirname, '..', '..', 'public');
  app.use(staticGuard);
  app.use(express.static(publicDir, {
    dotfiles: 'deny',
    index: false,
    fallthrough: true,
  }));
  app.use(cacheHeaders);

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { success: false, message: 'Terlalu banyak permintaan' },
  });
  app.use('/api', globalLimiter);

  // Route API (tanpa DB — hanya untuk test static)
  app.use('/api/auth', authRoutes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
  });

  // Error handler
  app.use((err, req, res, next) => {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
  });

  return { app };
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
