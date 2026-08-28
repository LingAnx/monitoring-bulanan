const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/seksi - List all seksi
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM seksi ORDER BY id');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching seksi:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat data seksi' });
  }
});

// POST /api/seksi - Create seksi (admin only)
router.post('/', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { nama_seksi } = req.body;
    if (!nama_seksi) {
      return res.status(400).json({ success: false, message: 'Nama seksi wajib diisi' });
    }
    const result = await pool.query(
      'INSERT INTO seksi (nama_seksi) VALUES ($1) RETURNING *',
      [nama_seksi]
    );
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'seksi.create', `Membuat seksi: ${nama_seksi}`]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating seksi:', error);
    res.status(500).json({ success: false, message: 'Gagal membuat seksi' });
  }
});

// PUT /api/seksi/:id - Update seksi name (admin only)
router.put('/:id', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nama_seksi } = req.body;
    if (!nama_seksi) {
      return res.status(400).json({ success: false, message: 'Nama seksi wajib diisi' });
    }
    const result = await pool.query(
      'UPDATE seksi SET nama_seksi = $1 WHERE id = $2 RETURNING *',
      [nama_seksi, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Seksi tidak ditemukan' });
    }
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'seksi.update', `Memperbarui sek "${result.rows[0].nama_seksi}"`]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating seksi:', error);
    res.status(500).json({ success: false, message: 'Gagal memperbarui seksi' });
  }
});

// DELETE /api/seksi/:id - Delete/deactivate seksi (admin only)
router.delete('/:id', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    // Check if any user is assigned to this section
    const userCount = await pool.query('SELECT COUNT(*) AS cnt FROM users WHERE id_seksi = $1', [id]);
    if (parseInt(userCount.rows[0].cnt) > 0) {
      return res.status(409).json({
        success: false,
        message: `Seksi memiliki ${userCount.rows[0].cnt} pengguna terkait. Nonaktifkan pengguna terlebih dahulu.`
      });
    }
    const result = await pool.query('DELETE FROM seksi WHERE id = $1 RETURNING nama_seksi', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Seksi tidak ditemukan' });
    }
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'seksi.delete', `Menghapus sek: ${result.rows[0].nama_seksi}`]
    );
    res.json({ success: true, message: 'Seksi berhasil dihapus' });
  } catch (error) {
    console.error('Error deleting seksi:', error);
    res.status(500).json({ success: false, message: 'Gagal menghapus seksi' });
  }
});

module.exports = router;
