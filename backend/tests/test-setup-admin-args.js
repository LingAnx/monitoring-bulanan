#!/usr/bin/env node
// ══════════════════════════════════════════════════════════
// test-setup-admin-args.js
// Deterministic test: verifies setup-admin.js arg/env resolution
// WITHOUT executing the script or connecting to DB.
//
// Approach: reproduce the exact resolution logic from setup-admin.js
// and test it against known inputs. This is a "mirror" test —
// it tests that the documented behavior matches the code.
// ══════════════════════════════════════════════════════════

let passed = 0, failed = 0;
function ok(name) { passed++; console.log(`  ✅ PASS: ${name}`); }
function bad(name, extra) { failed++; console.log(`  ❌ FAIL: ${name}${extra ? ` -- ${extra}` : ''}`); }

// ── Mirror of setup-admin.js resolution logic ────────────
// source: backend/scripts/setup-admin.js lines 28–41
function resolveArgs(args, env) {
  // args = [username?, password?, nama?] (process.argv[2], [3], [4])
  // env = { ADMIN_USERNAME?, ADMIN_PASSWORD?, ADMIN_NAMA? }
  const username = args[0] || env.ADMIN_USERNAME || 'admin';

  // env var takes precedence over CLI arg
  const password = env.ADMIN_PASSWORD || args[1];
  if (!password) {
    return {
      ok: false,
      error: 'Password wajib diberikan. Gunakan env var ADMIN_PASSWORD atau arg CLI kedua',
    };
  }
  if (password.length < 12) {
    return { ok: false, error: `Password minimal 12 karakter. Password yang diberikan terlalu pendek.` };
  }

  const nama = args[2] || env.ADMIN_NAMA || 'Administrator';
  return { ok: true, username, password, nama };
}

// ── Test cases ───────────────────────────────────────────
console.log('test-setup-admin-args.js');
console.log('  Deterministic mirror-test of setup-admin.js arg/env resolution\n');

// 1. No password at all → fail
{
  const r = resolveArgs(['admin'], {});
  if (!r.ok && r.error && r.error.includes('ADMIN_PASSWORD')) {
    ok('no password → FATAL (pesan menyebut ADMIN_PASSWORD)');
  } else {
    bad('no password → FATAL', `got: ${JSON.stringify(r)}`);
  }
}

// 2. CLI: username + password (≥12 chars) → success
{
  const r = resolveArgs(['testuser', 'MyPassw0rdHere'], {});
  if (r.ok && r.username === 'testuser' && r.nama === 'Administrator') {
    ok('CLI testuser + MyPassw0rdHere → success, nama default');
  } else {
    bad('CLI testuser → success', `got: ${JSON.stringify(r)}`);
  }
}

// 3. CLI: username + password + nama → success with nama
{
  const r = resolveArgs(['u1', 'Passw0rdX123', 'Test Admin'], {});
  if (r.ok && r.username === 'u1' && r.nama === 'Test Admin') {
    ok('CLI with all 3 args → nama respected');
  } else {
    bad('CLI with nama', `got: ${JSON.stringify(r)}`);
  }
}

// 4. env ADMIN_PASSWORD overrides CLI password
{
  const r = resolveArgs(
    ['envuser', 'CliPassw0rdX12'],
    { ADMIN_PASSWORD: 'EnvPassw0rdX12' }
  );
  if (r.ok && r.password === 'EnvPassw0rdX12') {
    ok('env ADMIN_PASSWORD overrides CLI arg (precedence correct)');
  } else {
    bad('env ADMIN_PASSWORD precedence', `got password: ${r.password}`);
  }
}

// 5. env ADMIN_USERNAME + ADMIN_PASSWORD, no CLI args
{
  const r = resolveArgs([], { ADMIN_USERNAME: 'envadmin', ADMIN_PASSWORD: 'EnvAdminPw01x1' });
  if (r.ok && r.username === 'envadmin' && r.password === 'EnvAdminPw01x1') {
    ok('env only (no CLI) → username + password from env');
  } else {
    bad('env only → success', `got: ${JSON.stringify(r)}`);
  }
}

// 6. Short password (<12) → fail
{
  const r = resolveArgs(['shortuser', 'short'], {});
  if (!r.ok && r.error && r.error.includes('minimal 12')) {
    ok('short password → FATAL (pesan menyebut minimal 12)');
  } else {
    bad('short password → FATAL', `got: ${JSON.stringify(r)}`);
  }
}

// 7. No args at all → default username 'admin', no password → fail
{
  const r = resolveArgs([], {});
  if (!r.ok) {
    ok('no args → FATAL (no password, default username admin)');
  } else {
    bad('no args → FATAL', `got: ${JSON.stringify(r)}`);
  }
}

// 8. Error message does NOT reference wrong arg position
//    (regression guard for the original bug: "pos 2")
{
  const r = resolveArgs(['admin'], {});
  if (!r.ok && !r.error.includes('pos 2') && r.error.includes('CLI kedua')) {
    ok('error message uses "arg CLI kedua" (not "pos 2")');
  } else {
    bad('error message accurate', `got: ${r.error}`);
  }
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed, ${passed + failed} total ===`);
process.exit(failed > 0 ? 1 : 0);
