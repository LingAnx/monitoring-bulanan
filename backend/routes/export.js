const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ── CSV Helpers ──────────────────────────────────────────────────────────
function rowsToCSV(rows, fields) {
  const header = fields.join(',');
  const lines = rows.map((row) =>
    fields
      .map((f) => {
        const val = row[f] === null || row[f] === undefined ? '' : String(row[f]);
        return /[,\n"]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val;
      })
      .join(',')
  );
  return [header, ...lines].join('\n');
}

// ── Export Users CSV ─────────────────────────────────────────────────────
router.get('/csv/users', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.nama, u.nip, u.role, u.is_active,
              s.nama_seksi, u.created_at
       FROM users u
       LEFT JOIN seksi s ON u.id_seksi = s.id
       ORDER BY u.id`
    );
    const fields = ['id', 'username', 'nama', 'nip', 'role', 'is_active', 'nama_seksi', 'created_at'];
    const csv = rowsToCSV(result.rows, fields);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting users CSV:', error);
    res.status(500).json({ success: false, message: 'Gagal mengekspor pengguna' });
  }
});

// ── Export Reports CSV ───────────────────────────────────────────────────
router.get('/csv/reports', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { bulan, tahun } = req.query;
    let sql = `SELECT l.id, l.judul, l.bulan, l.tahun, l.status, l.catatan_admin,
                     l.tanggal_pengajuan, u.nama AS nama_pegawai, u.nip,
                     s.nama_seksi
              FROM laporan l
              JOIN users u ON l.id_user = u.id
              LEFT JOIN seksi s ON u.id_seksi = s.id`;
    const params = [];
    if (bulan && tahun) {
      sql += ` WHERE l.bulan = $1 AND l.tahun = $2`;
      params.push(parseInt(bulan), parseInt(tahun));
    }
    sql += ' ORDER BY l.id DESC';
    const result = await pool.query(sql, params);
    const fields = [
      'id', 'judul', 'bulan', 'tahun', 'status', 'catatan_admin',
      'tanggal_pengajuan', 'nama_pegawai', 'nip', 'nama_seksi',
    ];
    const csv = rowsToCSV(result.rows, fields);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="laporan.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting reports CSV:', error);
    res.status(500).json({ success: false, message: 'Gagal mengekspor laporan' });
  }
});

// ── PDF Reports (stub) ───────────────────────────────────────────────────
router.get('/pdf/reports', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  res.json({
    success: true,
    message: 'PDF export akan segera hadir',
    data: null,
  });
});

module.exports = router;
