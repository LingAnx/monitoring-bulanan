const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { authenticateToken, requireRole} = require('../middleware/auth');

// GET /api/pegawai - List all pegawai in admin's section
router.get('/', authenticateToken,requireRole('ADMIN_SEKSI'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.nama, u.nip, u.username, u.role, u.is_active,
              u.id_seksi, s.nama_seksi,
              (SELECT COUNT(*) FROM laporan l WHERE l.id_user = u.id AND l.status != 'draft') as total_laporan,
              (SELECT COUNT(*) FROM laporan l JOIN users u2 ON l.id_user = u2.id WHERE u2.id = u.id AND l.status = 'disetujui') as laporan_disetujui,
              (SELECT COUNT(*) FROM laporan l JOIN users u2 ON l.id_user = u2.id WHERE u2.id = u.id AND l.status = 'diajukan') as laporan_pending,
              (SELECT MAX(l.tahun) || '-' || LPAD(MAX(l.bulan)::text, 2, '0') FROM laporan l JOIN users u2 ON l.id_user = u2.id WHERE u2.id = u.id) as terakhir_lapor
       FROM users u
       LEFT JOIN seksi s ON u.id_seksi = s.id
       WHERE u.role = 'PEGAWAI' AND u.id_seksi = $1
       ORDER BY u.nama`,
      [req.user.id_seksi]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching pegawai:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat data pegawai' });
  }
});

// GET /api/pegawai/deadline - Check deadline compliance per month
router.get('/deadline', authenticateToken, requireRole('ADMIN_SEKSI'),  async (req, res) => {
  try {
    const { bulan, tahun } = req.query;
    const b = bulan ? parseInt(bulan) : new Date().getMonth() + 1;
    const t = tahun ? parseInt(tahun) : new Date().getFullYear();

    const allPegawai = await pool.query(
      `SELECT u.id, u.nama, u.nip, s.nama_seksi
       FROM users u JOIN seksi s ON u.id_seksi = s.id
       WHERE u.role = 'PEGAWAI' AND u.id_seksi = $1`,
      [req.user.id_seksi]
    );

    const submitted = await pool.query(
      `SELECT id_user FROM laporan WHERE bulan = $1 AND tahun = $2`,
      [b, t]
    );
    const submittedIds = new Set(submitted.rows.map(r => r.id_user));

    const result = allPegawai.rows.map(p => ({
      ...p,
      sudah_lapor: submittedIds.has(p.id),
      bulan, tahun
    }));

    res.json({ success: true, data: result, bulan: b, tahun: t });
  } catch (error) {
    console.error('Error fetching deadline:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat data deadline' });
  }
});

module.exports = router;
