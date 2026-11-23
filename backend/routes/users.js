const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

const VALID_ROLES = ['PEGAWAI', 'ADMIN_SEKSI', 'KEPALA_KANTOR', 'SUPERADMIN'];

function validateRole(role) {
  if (!VALID_ROLES.includes(role)) {
    return { valid: false, message: `Role tidak valid. Harus salah satu dari: ${VALID_ROLES.join(', ')}` };
  }
  return { valid: true };
}

// GET /api/users - List users (SUPERADMIN only)
// Returns id_seksi alongside nama_seksi for edit modal pre-selection
router.get('/', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.nama, u.nip, u.role, u.is_active, u.id_seksi, u.created_at,
             s.nama_seksi
      FROM users u
      LEFT JOIN seksi s ON u.id_seksi = s.id
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching users', { error: error.message });
    res.status(500).json({ success: false, message: 'Gagal memuat daftar pengguna' });
  }
});

// POST /api/users - Create user (SUPERADMIN only)
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
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (username, password, nama, nip, id_seksi, role, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, nama, role, is_active',
      [username, hash, nama, nip || null, id_seksi || null, role, is_active !== false]
    );
    // Audit
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'user.create', `Membuat pengguna: ${username} (${role})`]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating user', { error: error.message });
    res.status(500).json({ success: false, message: 'Gagal membuat pengguna' });
  }
});

// PUT /api/users/:id - Update user (SUPERADMIN only)
router.put('/:id', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, nip, id_seksi, role, is_active } = req.body;

    // Prevent self-deactivation
    if (is_active === false && parseInt(id) === req.user.id) {
      return res.status(409).json({ success: false, message: 'Tidak dapat menonaktifkan akun sendiri' });
    }

    if (role !== undefined) {
      const roleValidation = validateRole(role);
      if (!roleValidation.valid) {
        return res.status(400).json({ success: false, message: roleValidation.message });
      }
    }
    const result = await pool.query(
      'UPDATE users SET nama=$1, nip=$2, id_seksi=$3, role=$4, is_active=$5, token_version=COALESCE(token_version, 0) + 1 WHERE id=$6 RETURNING id, username, nama, role, is_active',
      [nama, nip, id_seksi, role, is_active, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    }
    // Audit
    const u = result.rows[0];
    await pool.query(
      'INSERT INTO audit_trail (id_user, id_laporan, action, detail) VALUES ($1, NULL, $2, $3)',
      [req.user.id, 'user.update', `Memperbarui pengguna: ${u.username} → role=${u.role}, is_active=${u.is_active}`]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating user', { error: error.message });
    res.status(500).json({ success: false, message: 'Gagal memperbarui pengguna' });
  }
});

// PATCH /api/users/:id/toggle-status - Safe deactivation/reactivation (SUPERADMIN only)
router.patch('/:id/toggle-status', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.user.id) {
      return res.status(409).json({ success: false, message: 'Tidak dapat mengubah status akun sendiri' });
    }
    // Get current status to flip it
    const current = await pool.query('SELECT is_active, username FROM users WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    }
    const newActive = !current.rows[0].is_active;
    const result = await pool.query(
      'UPDATE users SET is_active = $1, token_version = COALESCE(token_version, 0) + 1 WHERE id = $2 RETURNING id, username, nama, role, is_active',
      [newActive, id]
    );
    const action = newActive ? 'user.activate' : 'user.deactivate';
    const detail = newActive
      ? `Mengaktifkan ulang akun: ${result.rows[0].username}`
      : `Menonaktifkan akun: ${result.rows[0].username}`;
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, action, detail]
    );
    res.json({ success: true, data: result.rows[0], message: newActive ? 'Akun diaktifkan' : 'Akun dinonaktifkan' });
  } catch (error) {
    logger.error('Error toggling user status', { error: error.message });
    res.status(500).json({ success: false, message: 'Gagal mengubah status pengguna' });
  }
});

// POST /api/users/:id/reset-password - SUPERADMIN password reset (SUPERADMIN only)
router.post('/:id/reset-password', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });
    }
    if (parseInt(id) === req.user.id) {
      return res.status(409).json({ success: false, message: 'Tidak dapat mereset password akun sendiri' });
    }
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "UPDATE users SET password = $1, must_change_password = true, token_version = COALESCE(token_version, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username, nama",
      [hash, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    }
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'user.password_reset', `Merесet password pengguna: ${result.rows[0].username} (oleh Superadmin)`]
    );
    res.json({ success: true, message: 'Password berhasil direset' });
  } catch (error) {
    logger.error('Error resetting password', { error: error.message });
    res.status(500).json({ success: false, message: 'Gagal mereset password' });
  }
});

// DELETE /api/users/:id - Hard delete with safety checks (SUPERADMIN only)
// Only allows deletion if user has NO historical records
router.delete('/:id', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    // Cannot delete self
    if (parseInt(id) === req.user.id) {
      return res.status(409).json({ success: false, message: 'Tidak dapat menghapus akun sendiri' });
    }

    // Check if user has reports
    const reportCount = await pool.query('SELECT COUNT(*) AS cnt FROM laporan WHERE id_user = $1', [id]);
    if (parseInt(reportCount.rows[0].cnt) > 0) {
      return res.status(409).json({
        success: false,
        message: `Pengguna memiliki ${reportCount.rows[0].cnt} laporan. Gunakan "Nonaktifkan Akun" alih-alih menghapus.`
      });
    }

    // Check if user has audit entries
    const auditCount = await pool.query('SELECT COUNT(*) AS cnt FROM audit_trail WHERE id_user = $1', [id]);
    if (parseInt(auditCount.rows[0].cnt) > 0) {
      return res.status(409).json({
        success: false,
        message: 'Pengguna memiliki riwayat audit. Gunakan "Nonaktifkan Akun" alih-alih menghapus.'
      });
    }

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING username, nama', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    }
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'user.delete', `Menghapus pengguna: ${result.rows[0].username}`]
    );
    res.json({ success: true, message: 'Pengguna dihapus' });
  } catch (error) {
    logger.error('Error deleting user', { error: error.message });
    res.status(500).json({ success: false, message: 'Gagal menghapus pengguna' });
  }
});

module.exports = router;
