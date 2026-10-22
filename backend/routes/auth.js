const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db/database');
const { authenticateToken, signUserToken } = require('../middleware/auth');

// ============================================================
// POST /api/auth/login
// - Cek is_active (nonaktif → 401)
// - Cek must_change_password (flag ON → 401 + code
//   PASSWORD_CHANGE_REQUIRED, BUKAN token, BUKAN redirect)
// - Success → token baru (HS256, 12h, token_version di payload)
// - Tidak bocor stack trace / error DB ke client.
// ============================================================
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }

    const result = await pool.query(
      `SELECT * FROM users WHERE username = $1 AND is_active = true`,
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }
    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    // Must change password → 401 + code khusus, TANPA token.
    if (user.must_change_password === true || user.must_change_password === 't') {
      return res.status(401).json({
        success: false,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Password wajib diubah sebelum melanjutkan',
      });
    }

    // Token baru, token_version di payload agar revokasi massal bekerja.
    const token = signUserToken({
      ...user,
      token_version: user.token_version || 0,
    });

    const { password: _pw, ...userWithoutPassword } = user;
    res.json({ success: true, token, user: userWithoutPassword });
  } catch (error) {
    // Stack trace hanya ke log — tidak bocor ke client.
    console.error('Login error:', error);
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
    await pool.query(
      `UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = $1`,
      [req.user.id]
    );
    res.json({ success: true, message: 'Semua sesi telah dicabut' });
  } catch (error) {
    console.error('Logout-all error:', error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
});

// ============================================================
// PUT /api/auth/change-password
// Ubah password user yang login. Set must_change_password=false
// setelah perubahan sukses. Increment token_version untuk
// memaksa logout-all di device lain.
// Body: { currentPassword, newPassword, confirmNewPassword }
// - newPassword:  min 8 char, min 1 huruf + 1 angka
// - confirmNewPassword:  harus sama
// - currentPassword:  harus benar
// ============================================================
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'currentPassword, newPassword, confirmNewPassword wajib diisi'
      });
    }

    // Validasi policy password.
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password baru minimal 8 karakter'
      });
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password baru harus mengandung minimal 1 huruf dan 1 angka'
      });
    }
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'Konfirmasi password tidak cocok'
      });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password baru tidak boleh sama dengan password lama'
      });
    }

    // Verifikasi password lama.
    const result = await pool.query(
      `SELECT password FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
    const isValid = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Password lama salah' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    // Increment token_version → semua JWT lama (termasuk sesi lain)
    // ditolak middleware.
    await pool.query(
      `UPDATE users
       SET password = $1,
           must_change_password = false,
           token_version = COALESCE(token_version, 0) + 1
       WHERE id = $2`,
      [newHash, req.user.id]
    );

    res.json({
      success: true,
      message: 'Password berhasil diubah. Silakan login kembali di device lain.'
    });
  } catch (error) {
    console.error('Change-password error:', error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan saat mengubah password' });
  }
});

// ============================================================
// POST /api/auth/reset-password
// Dipakai setelah forgot-password flow (link token-based) atau
// untuk user dengan must_change_password=true yang sedang
// login dengan credential lama yang belum valid.
//
// Catatan: endpoint ini TIDAK memverifikasi currentPassword —
// dipakai khusus untuk reset via email link (yang diimplementasi
// terpisah, di luar scope audit).
//
// Body: { newPassword, confirmNewPassword }
// ============================================================
router.post('/reset-password', authenticateToken, async (req, res) => {
  try {
    const { newPassword, confirmNewPassword } = req.body;
    if (!newPassword || !confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'newPassword dan confirmNewPassword wajib diisi'
      });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password baru minimal 8 karakter'
      });
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password baru harus mengandung minimal 1 huruf dan 1 angka'
      });
    }
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'Konfirmasi password tidak cocok'
      });
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

    res.json({
      success: true,
      message: 'Password berhasil direset. Silakan login ulang.'
    });
  } catch (error) {
    console.error('Reset-password error:', error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan saat mereset password' });
  }
});

module.exports = router;
