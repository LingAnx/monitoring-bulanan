const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const VALID_ROLES = ['PEGAWAI', 'ADMIN_SEKSI', 'KEPALA_KANTOR', 'SUPERADMIN'];

function validateRole(role) {
  if (!VALID_ROLES.includes(role)) {
    return { valid: false, message: `Role tidak valid. Harus salah satu dari: ${VALID_ROLES.join(', ')}` };
  }
  return { valid: true };
}


// GET /api/users - List users (admin only)
router.get('/', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.nama, u.nip, u.role, u.is_active, u.created_at,
             s.nama_seksi
      FROM users u
      LEFT JOIN seksi s ON u.id_seksi = s.id
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat daftar pengguna' });
  }
});

// POST /api/users - Create user (admin only)
router.post('/', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { username, password, nama, nip, id_seksi, role, is_active } = req.body;
    if (!username || !password || !nama || !role) {
      return res.status(400).json({ success: false, message: 'Username, password, nama, dan role wajib diisi' });
    }
    const roleValidation = validateRole(role);
    if (!roleValidation.valid) {
      return res.status(400).json({ success: false, message: roleValidation.message });
    }
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Username sudah digunakan' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password, nama, nip, id_seksi, role, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, nama, role',
      [username, hash, nama, nip || null, id_seksi || null, role, is_active !== false]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, message: 'Gagal membuat pengguna' });
  }
});

// PUT /api/users/:id - Update user (admin only)
router.put('/:id', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, nip, id_seksi, role, is_active } = req.body;
    if (role !== undefined) {
      const roleValidation = validateRole(role);
      if (!roleValidation.valid) {
        return res.status(400).json({ success: false, message: roleValidation.message });
      }
    }
    const result = await pool.query(
      'UPDATE users SET nama=$1, nip=$2, id_seksi=$3, role=$4, is_active=$5 WHERE id=$6 RETURNING id, username, nama, role',
      [nama, nip, id_seksi, role, is_active, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ success: false, message: 'Gagal memperbarui pengguna' });
  }
});

// DELETE /api/users/:id - Delete user (admin only)
router.delete('/:id', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    }
    res.json({ success: true, message: 'Pengguna dihapus' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ success: false, message: 'Gagal menghapus pengguna' });
  }
});

module.exports = router;
