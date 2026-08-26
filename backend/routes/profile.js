const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

router.put('/', authenticateToken, async (req, res) => {
  try {
    const { nama, nip, password } = req.body;
    const updates = {};
    if (nama) updates.nama = nama;
    if (nip !== undefined) updates.nip = nip || null;
    if (password) {
      updates.password = await bcrypt.hash(password, 10);
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data yang diubah' });
    }
    const sets = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = Object.values(updates);
    const result = await pool.query(
      `UPDATE users SET ${sets} WHERE id = $${values.length + 1} RETURNING id, username, nama, nip, role, (SELECT nama_seksi FROM seksi WHERE id = (SELECT id_seksi FROM users WHERE id = $${values.length + 1})) AS nama_seksi`,
      [...values, req.user.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating profile:', error);
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
    console.error('Error fetching profile:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat profil' });
  }
});

module.exports = router;
