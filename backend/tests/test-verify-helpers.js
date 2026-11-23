// Unit test: pure token verification helpers + combined middleware
// Simulates authenticateChangePassword logic without a real DB
// (DB call is mocked via a simple in-memory user store).
//
// Run: node tests/test-verify-helpers.js
// Persyaratan: JWT_SECRET tersedia di environment (min 32 char).

'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ── Setup: secret test (tidak dibaca dari .env agar deterministik) ──
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');

// Memuat helper dari source nyata (path relatif dari backend/).
// File ini dijalankan dari backend/ agar require path bekerja.
const {
  verifyAppToken,
  verifyPasswordChangeToken,
  PWD_CHANGE_AUDIENCE,
  JWT_SECRET,
  JWT_ISSUER,
  JWT_ALGORITHM,
} = require('../middleware/auth');

let passed = 0, failed = 0;
function ok(name) { passed++; console.log('  ✅ PASS: ' + name); }
function bad(name, extra) { failed++; console.log('  ❌ FAIL: ' + name + (extra ? ' — ' + extra : '')); }
function assert(cond, name, extra) { cond ? ok(name) : bad(name, extra); }

// ── Helper untuk buat token ──────────────────────────────────
function appToken(payload, opts = {}) {
  const base = {
    userId: 1, role: 'PEGAWAI', token_version: 0,
    ...payload,
    subject: String(payload.sub ?? 1),
  };
  return jwt.sign(base, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: 'ksop-laporan-app',
    expiresIn: opts.expiresIn || '1h',
  });
}

function pwdToken(payload, opts = {}) {
  const base = {
    userId: 1, purpose: 'password-change', token_version: 0,
    ...payload,
    subject: String(payload.sub ?? 1),
  };
  return jwt.sign(base, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: PWD_CHANGE_AUDIENCE,
    expiresIn: opts.expiresIn || '10m',
  });
}

// ── 1. verifyAppToken: token valid ───────────────────────────
{
  const t = appToken({ userId: 1, token_version: 0 });
  const r = verifyAppToken(t);
  assert(r.ok === true, 'verifyAppToken: token app valid → ok=true', JSON.stringify(r));
  assert(r.userId === 1, 'verifyAppToken: userId = 1', 'got ' + r.userId);
  assert(r.token_version === 0, 'verifyAppToken: token_version = 0');
}

// ── 2. verifyAppToken: token kedaluwarsa ─────────────────────
{
  // expiresIn: -10 (sudah kedaluwarsa)
  const t = jwt.sign(
    { userId: 1, token_version: 0, subject: '1' },
    JWT_SECRET,
    { algorithm: 'HS256', issuer: JWT_ISSUER, audience: 'ksop-laporan-app', expiresIn: -10 }
  );
  const r = verifyAppToken(t);
  assert(r.ok === false, 'verifyAppToken: token kedaluwarsa → ok=false', JSON.stringify(r));
  assert(/kedaluwarsa/i.test(r.reason || ''), 'verifyAppToken: reason menyebut kedaluwarsa', r.reason);
}

// ── 3. verifyAppToken: token pwd-change (audience beda) ditolak ─
{
  const t = pwdToken({});
  const r = verifyAppToken(t);
  assert(r.ok === false, 'verifyAppToken: token pwd-change (audience lain) ditolak', JSON.stringify(r));
}

// ── 4. verifyPasswordChangeToken: token valid ────────────────
{
  const t = pwdToken({ userId: 1, token_version: 2 });
  const r = verifyPasswordChangeToken(t);
  assert(r.ok === true, 'verifyPasswordChangeToken: token valid → ok=true', JSON.stringify(r));
  assert(r.token_version === 2, 'verifyPasswordChangeToken: token_version = 2', 'got ' + r.token_version);
}

// ── 5. verifyPasswordChangeToken: token app ditolak ─────────���
{
  const t = appToken({});
  const r = verifyPasswordChangeToken(t);
  assert(r.ok === false, 'verifyPasswordChangeToken: token app (audience lain) ditolak', JSON.stringify(r));
}

// ── 6. verifyPasswordChangeToken: purpose salah ditolak ─────
{
  const t = jwt.sign(
    { userId: 1, purpose: 'satu-usage', token_version: 0, subject: '1' },
    JWT_SECRET,
    { algorithm: 'HS256', issuer: JWT_ISSUER, audience: PWD_CHANGE_AUDIENCE, expiresIn: '10m' }
  );
  const r = verifyPasswordChangeToken(t);
  assert(r.ok === false, 'verifyPasswordChangeToken: purpose salah → ditolak', JSON.stringify(r));
}

// ── 7. verifyAppToken: token kosong → ditolak ───────────────
{
  const r = verifyAppToken(null);
  assert(r.ok === false, 'verifyAppToken: null → ok=false', JSON.stringify(r));
}

// ── 8. verifyAppToken: string acak (bukan JWT) ditolak ──────
{
  const r = verifyAppToken('not-a-jwt-token');
  assert(r.ok === false, 'verifyAppToken: string acak → ok=false', JSON.stringify(r));
}

// ── Simulasi alur authenticateChangePassword (logika murni) ──
// DB mock: user_id 1 = flag ON, token_version 5
//           user_id 2 = flag OFF, token_version 0
//           user_id 3 = flag ON, token_version 0 (versi token lama)
const USERS = {
  1: { id: 1, is_active: true, must_change_password: true,  token_version: 5 },
  2: { id: 2, is_active: true, must_change_password: false, token_version: 0 },
  3: { id: 3, is_active: true, must_change_password: true,  token_version: 0 },
};
function loadUser(userId) { return USERS[userId] || null; }

/**
 * Simulasi combined middleware (tanpa DB asli):
 * 1. Coba verifyAppToken
 * 2. Jika gagal, coba verifyPasswordChangeToken
 * 3. Cek token_version + must_change_password di mock DB
 * Mengembalikan: { ok, purpose?, code?, message? }
 */
async function simulateCombined(token, dbTokenVersionOverride) {
  const appRes = verifyAppToken(token);

  if (appRes.ok) {
    const user = loadUser(appRes.userId);
    if (!user) return { ok: false, code: 'NOT_FOUND' };
    if (user.is_active === false) return { ok: false, code: 'INACTIVE' };
    const dbV = dbTokenVersionOverride !== undefined ? dbTokenVersionOverride : (user.token_version || 0);
    const tvMatch = appRes.token_version === undefined ? (dbV === 0) : (appRes.token_version === dbV);
    if (!tvMatch) return { ok: false, code: 'TOKEN_REVOKED' };
    if (user.must_change_password === true) return { ok: false, code: 'PASSWORD_CHANGE_REQUIRED' };
    return { ok: true, purpose: 'session', userId: user.id };
  }

  const pwdRes = verifyPasswordChangeToken(token);
  if (pwdRes.ok) {
    const user = loadUser(pwdRes.userId);
    if (!user) return { ok: false, code: 'NOT_FOUND' };
    if (user.is_active === false) return { ok: false, code: 'INACTIVE' };
    if (pwdRes.token_version !== (user.token_version || 0)) return { ok: false, code: 'TOKEN_REVOKED' };
    if (user.must_change_password !== true) return { ok: false, code: 'FLAG_OFF' };
    return { ok: true, purpose: 'password-change', userId: user.id };
  }

  return { ok: false, code: 'INVALID_TOKEN', message: pwdRes.reason || appRes.reason };
}

// ── 9. Session token valid + user flag OFF → sukses ─────────
(async () => {
  {
    const t = appToken({ userId: 2, token_version: 0 });
    const r = await simulateCombined(t);
    assert(r.ok && r.purpose === 'session', 'combined: app token + user normal → session', JSON.stringify(r));
  }

  // ── 10. App token user flag ON → 401 PASSWORD_CHANGE_REQUIRED ──
  {
    const t = appToken({ userId: 1, token_version: 5 });
    const r = await simulateCombined(t);
    assert(!r.ok && r.code === 'PASSWORD_CHANGE_REQUIRED',
      'combined: app token + user flag ON → PASSWORD_CHANGE_REQUIRED', JSON.stringify(r));
  }

  // ── 11. Pwd token valid + user flag ON + versi cocok → sukses ──
  {
    const t = pwdToken({ userId: 3, token_version: 0 });
    const r = await simulateCombined(t);
    assert(r.ok && r.purpose === 'password-change',
      'combined: pwd token + flag ON + versi cocok → success', JSON.stringify(r));
  }

  // ── 12. Pwd token versi LAMA ditolak (reuse setelah change) ──
  {
    // user 3 token_version di DB = 0; token dengan versi 999 ditolak
    const t = pwdToken({ userId: 3, token_version: 999 });
    const r = await simulateCombined(t);
    assert(!r.ok && r.code === 'TOKEN_REVOKED',
      'combined: pwd token versi tidak cocok → TOKEN_REVOKED (reuse dicegah)', JSON.stringify(r));
  }

  // ── 13. Pwd token user flag OFF ditolak (mis. flag sudah OFF) ─
  {
    const t = pwdToken({ userId: 2, token_version: 0 });
    const r = await simulateCombined(t);
    assert(!r.ok && r.code === 'FLAG_OFF',
      'combined: pwd token + user flag OFF → ditolak', JSON.stringify(r));
  }

  // ── 14. Token kedaluwarsa ditolak ────────────────────────────
  {
    const t = pwdToken({ userId: 3, token_version: 0 }, { expiresIn: -10 });
    const r = await simulateCombined(t);
    assert(!r.ok, 'combined: token kedaluwarsa → ditolak', JSON.stringify(r));
  }

  // ── 15. Token acak (bukan JWT) ditolak ───────────────────────
  {
    const r = await simulateCombined('garbage-token-not-jwt');
    assert(!r.ok && r.code === 'INVALID_TOKEN',
      'combined: token acak → INVALID_TOKEN', JSON.stringify(r));
  }

  // ── 16. Tidak ada token (null) ditolak ───────────────────────
  {
    const r = await simulateCombined(null);
    assert(!r.ok, 'combined: token null → ditolak', JSON.stringify(r));
  }

  console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total ===');
  process.exit(failed > 0 ? 1 : 0);
})();
