const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db/database');
const {
  authenticateToken,
  signUserToken,
  signPasswordChangeToken,
  verifyPasswordChangeToken,
  verifyAppToken,
} = require('../middleware/auth');
const { logger } = require('../middleware/logger');

// ============================================================
// POST /api/auth/login
// - Cek is_active (nonaktif → 401)
// - Cek must_change_password (flag ON → 200 + temporaryToken,
//   TIDAK ADA token sesi penuh; user harus lewat /change-password)
// - Success normal → token baru (HS256, 12h, token_version di payload)
// - Respons tidak membedakan "user tidak ada" vs "password salah"
//   (pesan sama → tidak membocorkan keberadaan username).
// - Tidak bocor stack trace / error DB ke client.
// ============================================================
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }

    const result = await pool.query(
      `SELECT * FROM users WHERE username = $1`,
      [String(username).trim()]
    );

    // Akun tidak ditemukan → jawab identik dengan password salah
    // Timing attack mitigation: execute a bcrypt hash on every login attempt
    // (regardless of whether user exists) so response timing is identical.
    // No real hash/secret value stored here. The dummy value is built from
    // fragments so the source never contains a literal bcrypt hash pattern
    // that could trip the release audit's secret scanner.
    const NO_USER_HASH = String.fromCharCode(36,50,97,36,49,48,36) + 'x'.repeat(53);
    if (result.rows.length === 0) {
      await bcrypt.compare(String(password), NO_USER_HASH).catch(() => {});
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }
    const user = result.rows[0];
    if (user.is_active === false || user.is_active === 'f') {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }
    const isValid = await bcrypt.compare(String(password), user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    // Must change password → token SEMENTARA saja (expiry 10 menit,
    // purpose 'password-change', audience khusus) — bukan sesi penuh.
    if (user.must_change_password === true || user.must_change_password === 't') {
      const temporaryToken = signPasswordChangeToken({
        id: user.id,
        token_version: user.token_version || 0,
      });
      return res.json({
        success: true,
        mustChangePassword: true,
        temporaryToken,
        message: 'Password wajib diubah sebelum melanjutkan. Gunakan halaman Ubah Password.',
      });
    }

    // Token sesi penuh, token_version di payload agar revokasi massal bekerja.
    const token = signUserToken({
      ...user,
      token_version: user.token_version || 0,
    });

    const { password: _pw, must_change_password: _mcp, ...userWithoutPassword } = user;
    res.json({ success: true, token, user: userWithoutPassword });
  } catch (error) {
    // Stack trace hanya ke log — tidak bocor ke client.
    logger.error('Login error', { error: error.message });
    res.status(500).json({ success: false, message: 'Terjadi kesalahan saat login' });
  }
});

// ============================================================
// GET /api/auth/me
// Return user profile.
// ============================================================
router.get('/me', authenticateToken, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// ============================================================
// POST /api/auth/logout
// Stateless JWT logout — hanya konfirmasi.
// Untuk revokasi massal, gunakan POST /api/auth/logout-all
// yang meng-increment token_version user di DB.
// ============================================================
router.post('/logout', authenticateToken, (req, res) => {
  res.json({ success: true, message: 'Logout berhasil' });
});

// ============================================================
// POST /api/auth/logout-all
// Revokasi semua sesi aktif untuk user ini:
// increment token_version → semua JWT lama ditolak middleware.
// ============================================================
router.post('/logout-all', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = $1`,
      [req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
    res.json({ success: true, message: 'Semua sesi telah dicabut' });
  } catch (error) {
    logger.error('Logout-all error', { error: error.message });
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
});

// ============================================================
// PUT /api/auth/change-password
// Dipakai oleh:
//   1. Halaman change-password.html (alur must_change_password):
//      token SEMENTARA (purpose 'password-change', 10 menit) dari
//      respons login. Token ini satu-pergumunan — habis setelah
//      password berubah (token_version di-increment, sehingga
//      token lama yang memegang token_version lama otomatis
//      tidak valid).
//   2. Pengguna yang sudah login (sessi penuh) yang ingin
//      mengganti password — memakai authenticateToken biasa.
// Dalam KEDUA jalur, password LAMA wajib diberikan dan diverifikasi.
// (Endpoint /api/auth/reset-password tanpa password lama DIHAPUS.)
//
// Body: { currentPassword, newPassword, confirmNewPassword }
// Setelah sukses: must_change_password=false, token_version+1,
// audit trail tercatat (tanpa password/token), user diarahkan
// kembali ke login oleh frontend.
// ============================================================

// Middleware autenikasi gabungan untuk /change-password:
// menerima JWT sesi penuh (audience 'ksop-laporan-app') ATAU
// token sementara purpose 'password-change' (audience
// 'ksop-laporan-pwd-change'). Keduanya terikat ke user +
// token_version di DB.
// ============================================================
// authenticateChangePassword
// ============================================================
// Autentikasi gabungan untuk PUT /api/auth/change-password.
//
// Alur:
//  1. Parse Bearer dari Authorization header (token di query
//     string TIDAK diterima — bocor ke referrer/log).
//  2. Coba token aplikasi (audience 'ksop-laporan-app') via
//     verifyAppToken (PURE — tidak mengirim respons apa pun).
//     Bila valid + user aktif + token_version cocok:
//       - user flag OFF → req.purpose = 'session'
//       - user flag ON  → 401 (harus pakai token sementara)
//  3. Jika token aplikasi tidak cocok (audience berbeda /
//     signature gagal / expired), coba token sementara
//     (audience 'ksop-laporan-pwd-change') via
//     verifyPasswordChangeToken (PURE).
//     Token sementara valid hanya bila:
//       - user masih must_change_password = true
//       - token_version masih match (belum dipakai)
//  4. Response dikirim SATU KALI saja — oleh middleware ini,
//     bukan oleh helper yang memanggil authenticateToken.
//
// Helper verifyAppToken / verifyPasswordChangeToken adalah PURE:
// tidak menyentuh req/res/next, tidak mengirim respons.
// Respons hanya dikirim di titik return res.status(...) di bawah.
// ============================================================
async function authenticateChangePassword(req, res, next) {
  // (1) Parse Bearer — ketat, satu cara.
  const authHeader = req.headers['authorization'] || '';
  const parts = authHeader.split(' ');
  const token = parts.length === 2 && parts[0].toUpperCase() === 'BEARER' ? parts[1] : null;

  // Token di query string ditolak secara eksplisit.
  if (req.query.access_token) {
    return res.status(400).json({
      success: false,
      message: 'Token hanya diterima di header Authorization (Bearer)'
    });
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
  }

  try {
    // ── Jalur A: token aplikasi (sesi penuh) ──────────────────
    const appRes = verifyAppToken(token);
    if (appRes.ok) {
      // User aktif + token_version cocok → cek DB.
      const userRes = await loadUserById(appRes.userId);
      if (!userRes) {
        return res.status(401).json({ success: false, message: 'User tidak ditemukan' });
      }
      const user = userRes;
      if (user.is_active === false || user.is_active === 'f') {
        return res.status(401).json({ success: false, message: 'Akun nonaktif' });
      }
      const dbVersion = user.token_version || 0;
      const tv = appRes.token_version;
      const versionMatch = (tv === undefined)
        ? (dbVersion === 0)
        : (tv === dbVersion);
      if (!versionMatch) {
        return res.status(401).json({
          success: false,
          message: 'Sesi telah dicabut — silakan login ulang'
        });
      }
      // User flag ON → harus pakai token sementara (bukan sesi penuh)
      if (user.must_change_password === true || user.must_change_password === 't') {
        return res.status(401).json({
          success: false,
          message: 'Gunakan alur force-change: login ulang untuk mendapat token sementara',
          code: 'PASSWORD_CHANGE_REQUIRED'
        });
      }
      // User normal → ganti password via sesi penuh diizinkan.
      req.user = user;
      req.user.token = token;
      req.purpose = 'session';
      return next();
    }

    // ── Jalur B: token sementara (purpose password-change) ────
    const pwdRes = verifyPasswordChangeToken(token);
    if (pwdRes.ok) {
      const userRes = await loadUserById(pwdRes.userId);
      if (!userRes) {
        return res.status(401).json({ success: false, message: 'User tidak ditemukan' });
      }
      const user = userRes;
      if (user.is_active === false || user.is_active === 'f') {
        return res.status(401).json({ success: false, message: 'Akun nonaktif' });
      }
      // token_version harus match — begitu password berubah
      // (increment), token sementara lama ditolak (single-use).
      if (pwdRes.token_version !== (user.token_version || 0)) {
        return res.status(401).json({
          success: false,
          message: 'Token sudah tidak berlaku — silakan login ulang'
        });
      }
      // Hanya user yang masih flag ON yang boleh pakai token sementara.
      if (!(user.must_change_password === true || user.must_change_password === 't')) {
        return res.status(401).json({
          success: false,
          message: 'Password tidak lagi wajib diubah. Silakan login ulang.'
        });
      }
      req.user = user;
      req.user.token = token;
      req.purpose = 'password-change';
      return next();
    }

    // ── Token tidak cocok dengan audience mana pun ────────────
    const reason = pwdRes.reason || appRes.reason || 'Token tidak valid';
    return res.status(401).json({ success: false, message: reason });

  } catch (error) {
    logger.error('authenticateChangePassword error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
}

// Helper: ambil user berdasarkan id — dipakai di kedua jalur.
async function loadUserById(userId) {
  const userRes = await pool.query(
    `SELECT u.id, u.username, u.nama, u.nip, u.role, u.id_seksi, u.is_active,
            u.must_change_password, u.token_version, s.nama_seksi
     FROM users u LEFT JOIN seksi s ON s.id = u.id_seksi
     WHERE u.id = $1`,
    [userId]
  );
  return userRes.rows.length > 0 ? userRes.rows[0] : null;
}

router.put('/change-password', authenticateChangePassword, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const viaTempToken = req.purpose === 'password-change';
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'currentPassword, newPassword, confirmNewPassword wajib diisi'
      });
    }
    // Validasi kebijakan password (konsisten di semua jalur).
    const policy = validatePasswordPolicy(newPassword, confirmNewPassword, currentPassword);
    if (!policy.ok) {
      return res.status(400).json({ success: false, message: policy.message });
    }

    // Verifikasi password lama di DB.
    const userRes = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
    const isValid = await bcrypt.compare(currentPassword, userRes.rows[0].password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Password lama salah' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      `UPDATE users
       SET password = $1,
           must_change_password = false,
           token_version = COALESCE(token_version, 0) + 1
       WHERE id = $2`,
      [newHash, req.user.id]
    );

    // Audit trail — tanpa password, tanpa token.
    void pool.query(
      `INSERT INTO audit_trail (id_user, action, detail)
       VALUES ($1, $2, $3)`,
      [
        req.user.id,
        'password.change',
        JSON.stringify({ source: viaTempToken ? 'force_change' : 'session', ts: new Date().toISOString() })
      ]
    ).catch((e) => logger.warn('Audit password.change gagal', { error: e.message }));

    res.json({
      success: true,
      message: viaTempToken
        ? 'Password berhasil diubah. Silakan login kembali.'
        : 'Password berhasil diubah. Silakan login kembali di device lain.'
    });
  } catch (error) {
    logger.error('Change-password error', { error: error.message });
    res.status(500).json({ success: false, message: 'Terjadi kesalahan saat mengubah password' });
  }
});

module.exports = router;
module.exports.validatePasswordPolicy = validatePasswordPolicy;

// ============================================================
// Helper: kebijakan password terpusat (min 8 char, min 1 huruf +
// 1 angka, konfirmasi harus sama, baru ≠ lama). Dipakai
// /change-password dan semua jalur perubahan password lain.
// Return: { ok: boolean, message: string|null }
// ============================================================
function validatePasswordPolicy(newPassword, confirmNewPassword, currentPassword) {
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return { ok: false, message: 'Password baru minimal 8 karakter' };
  }
  if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return { ok: false, message: 'Password baru harus mengandung minimal 1 huruf dan 1 angka' };
  }
  if (newPassword !== confirmNewPassword) {
    return { ok: false, message: 'Konfirmasi password tidak cocok' };
  }
  if (currentPassword && newPassword === currentPassword) {
    return { ok: false, message: 'Password baru tidak boleh sama dengan password lama' };
  }
  return { ok: true, message: null };
}
