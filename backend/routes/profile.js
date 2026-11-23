const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

router.put('/', authenticateToken, async (req, res) => {
  try {
    const { nama, nip, password, newPassword, confirmNewPassword, currentPassword } = req.body;
    const updates = {};
    if (nama) updates.nama = nama;
    if (nip !== undefined) updates.nip = nip || null;

    // Password change:
    //   - `password` (legacy, deprecated) — accepted, still hashed.
    //   - `newPassword` + `confirmNewPassword` (+ optional `currentPassword`)
    //     — preferred; enforces policy.
    // Both paths: increment token_version → revoke all other sessions.
    let passwordChanged = false;
    if (password || newPassword) {
      // Validate policy if newPassword given.
      if (newPassword) {
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
        // Verify current password before change.
        const cur = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
        if (cur.rows.length > 0 && currentPassword) {
          const ok = await bcrypt.compare(currentPassword, cur.rows[0].password);
          if (!ok) {
            return res.status(401).json({ success: false, message: 'Password lama salah' });
          }
        }
        if (newPassword === currentPassword) {
          return res.status(400).json({
            success: false,
            message: 'Password baru tidak boleh sama dengan password lama'
          });
        }
        updates.password = await bcrypt.hash(newPassword, 12);
      } else if (password) {
        // Legacy path: just hash, no policy check.
        updates.password = await bcrypt.hash(password, 12);
      }
      passwordChanged = true;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data yang diubah' });
    }

    // If password changed, also increment token_version and clear
    // must_change_password flag.
    if (passwordChanged) {
      updates.token_version = 'COALESCE(token_version, 0) + 1';
      updates.must_change_password = false;
    }

    const sets = Object.keys(updates).map((k, i) => {
      // Handle special expressions (token_version increment, must_change_password=false)
      if (k === 'token_version') return `${k} = ${updates[k]}`;
      if (k === 'must_change_password') return `${k} = ${updates[k]}`;
      return `${k} = $${i + 1}`;
    }).join(', ');
    const plainValues = Object.entries(updates)
      .filter(([k]) => !['token_version', 'must_change_password'].includes(k))
      .map(([, v]) => v);
    const values = [...plainValues, req.user.id];
    const paramOffset = plainValues.length + 1;
    const result = await pool.query(
      `UPDATE users SET ${sets} WHERE id = $${paramOffset} RETURNING id, username, nama, nip, role, (SELECT nama_seksi FROM seksi WHERE id = (SELECT id_seksi FROM users WHERE id = $${paramOffset})) AS nama_seksi`,
      values
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating profile', { error: error.message });
    res.status(500).json({ success: false, message: 'Gagal memperbarui profil' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.nama, u.nip, u.role, u.is_active, u.created_at,
             s.nama_seksi
      FROM users u
      LEFT JOIN seksi s ON u.id_seksi = s.id
      WHERE u.id = $1
    `, [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching profile', { error: error.message });
    res.status(500).json({ success: false, message: 'Gagal memuat profil' });
  }
});

module.exports = router;
