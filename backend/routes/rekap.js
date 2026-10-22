const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { toCSV } = require('../lib/csv');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/rekap/summary - Dashboard summary
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const summary = {};

    if (req.user.role === 'PEGAWAI') {
      const monthStats = await pool.query(`
        SELECT bulan, tahun, status, COUNT(*) as count
        FROM laporan WHERE id_user = $1
        GROUP BY bulan, tahun, status
        ORDER BY tahun DESC, bulan DESC
      `, [req.user.id]);
      summary.monthly = monthStats.rows;
      const statusStats = await pool.query(`
        SELECT status, COUNT(*) as count FROM laporan WHERE id_user = $1 GROUP BY status
      `, [req.user.id]);
      summary.byStatus = statusStats.rows.reduce((acc, row) => { acc[row.status] = parseInt(row.count); return acc; }, {});
      summary.total = Object.values(summary.byStatus).reduce((a, b) => a + b, 0);
    } else if (req.user.role === 'ADMIN_SEKSI') {
      const stats = await pool.query(`
        SELECT l.status, COUNT(*) as count
        FROM laporan l
        JOIN users u ON l.id_user = u.id
        WHERE u.id_seksi = $1
        GROUP BY l.status
      `, [req.user.id_seksi]);
      summary.byStatus = stats.rows.reduce((acc, row) => { acc[row.status] = parseInt(row.count); return acc; }, {});
      summary.total = Object.values(summary.byStatus).reduce((a, b) => a + b, 0);
    } else if (req.user.role === 'SUPERADMIN') {
      const totalPegawai = await pool.query("SELECT COUNT(*) as cnt FROM users WHERE role = 'PEGAWAI'");
      const totalLaporan = await pool.query('SELECT COUNT(*) as cnt FROM laporan');
      const totalSeksi = await pool.query('SELECT COUNT(*) as cnt FROM seksi');
      summary.totalPegawai = parseInt(totalPegawai.rows[0].cnt);
      summary.totalLaporan = parseInt(totalLaporan.rows[0].cnt);
      summary.totalSeksi = parseInt(totalSeksi.rows[0].cnt);
      const statusStats = await pool.query('SELECT status, COUNT(*) as count FROM laporan GROUP BY status');
      summary.byStatus = statusStats.rows.reduce((acc, row) => { acc[row.status] = parseInt(row.count); return acc; }, {});
      summary.total = parseInt(totalLaporan.rows[0].cnt);
    } else if (req.user.role === 'KEPALA_KANTOR') {
      const totalStats = await pool.query(
        "SELECT COUNT(*) FROM users WHERE role = \'PEGAWAI\'"
      );
      const laporanStats = await pool.query(`
        SELECT status, COUNT(*) as count 
        FROM laporan 
        GROUP BY status
      `);
      const bySeksi = await pool.query(`
        SELECT s.nama_seksi,
          COUNT(DISTINCT u.id) as total_pegawai,
          COUNT(DISTINCT CASE WHEN l.status = 'disetujui' THEN l.id END) as approved,
          COUNT(DISTINCT CASE WHEN l.status = 'diajukan' OR l.status = 'diteruskan' THEN l.id END) as pending
        FROM seksi s
        LEFT JOIN users u ON s.id = u.id_seksi AND u.role = 'PEGAWAI'
        LEFT JOIN laporan l ON u.id = l.id_user
        GROUP BY s.id, s.nama_seksi
        ORDER BY s.id
      `);
      summary.totalPegawai = parseInt(totalStats.rows[0].count);
      summary.byStatus = laporanStats.rows.reduce((acc, row) => { acc[row.status] = parseInt(row.count); return acc; }, {});
      summary.bySeksi = bySeksi.rows;
    }

    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Error fetching rekap:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat rekap' });
  }
});

// GET /api/rekap/export - Export to CSV
router.get('/export', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT l.judul, l.bulan, l.tahun, l.status,
             u.nama as nama_pegawai, u.nip, u.username, s.nama_seksi,
             l.capaian, l.kendala, l.tindak_lanjut,
             l.tanggal_pengajuan
      FROM laporan l
      JOIN users u ON l.id_user = u.id
      LEFT JOIN seksi s ON u.id_seksi = s.id
    `;
    const params = [];
    const conditions = [];

    if (req.user.role === 'PEGAWAI') {
      conditions.push('l.id_user = $' + (params.length + 1));
      params.push(req.user.id);
    } else if (req.user.role === 'ADMIN_SEKSI') {
      conditions.push('u.id_seksi = $' + (params.length + 1));
      params.push(req.user.id_seksi);
    }

    const { bulan, tahun, status } = req.query;
    if (bulan) { conditions.push('l.bulan = $' + (params.length + 1)); params.push(parseInt(bulan)); }
    if (tahun) { conditions.push('l.tahun = $' + (params.length + 1)); params.push(parseInt(tahun)); }
    if (status) { conditions.push('l.status = $' + (params.length + 1)); params.push(status); }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY l.tahun DESC, l.bulan DESC';

    const result = await pool.query(query, params);
    const headers = ['Judul', 'Bulan', 'Tahun', 'Status', 'Nama Pegawai', 'NIP', 'Username', 'Seksi', 'Capaian', 'Kendala', 'Tindak Lanjut', 'Tanggal Pengajuan'];
    const rows = result.rows.map(r => [
      r.judul, r.bulan, r.tahun, r.status, r.nama_pegawai, r.nip, r.username, r.nama_seksi,
      r.capaian || '', r.kendala || '', r.tindak_lanjut || '', r.tanggal_pengajuan || ''
    ]);

    const csv = toCSV(headers, rows);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=rekap_laporan.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting:', error);
    res.status(500).json({ success: false, message: 'Gagal export' });
  }
});

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Allowlist status CSS class — nilai DB mentah tidak pernah masuk ke class.
var STATUS_CLASS = {
  draft: 'status-draft',
  diajukan: 'status-diajukan',
  diteruskan: 'status-diteruskan',
  disetujui: 'status-disetujui',
  revisi_admin: 'status-revisi',
  revisi_kantor: 'status-revisi'
};
function statusClass(status) {
  return STATUS_CLASS[status] || 'status-draft';
}

// GET /api/rekap/export-pdf - Export to PDF
router.get('/export-pdf', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT l.judul, l.bulan, l.tahun, l.status,
             u.nama as nama_pegawai, u.nip, u.username, s.nama_seksi,
             l.capaian, l.kendala, l.tindak_lanjut,
             l.catatan_admin, l.catatan_kantor,
             l.tanggal_pengajuan, l.tanggal_verifikasi, l.tanggal_persetujuan
      FROM laporan l
      JOIN users u ON l.id_user = u.id
      LEFT JOIN seksi s ON u.id_seksi = s.id
    `;
    const params = [];
    const conditions = [];

    if (req.user.role === 'PEGAWAI') {
      conditions.push('l.id_user = $' + (params.length + 1));
      params.push(req.user.id);
    } else if (req.user.role === 'ADMIN_SEKSI') {
      conditions.push('u.id_seksi = $' + (params.length + 1));
      params.push(req.user.id_seksi);
    }

    const { bulan, tahun, status } = req.query;
    if (bulan) { conditions.push('l.bulan = $' + (params.length + 1)); params.push(parseInt(bulan)); }
    if (tahun) { conditions.push('l.tahun = $' + (params.length + 1)); params.push(parseInt(tahun)); }
    if (status) { conditions.push('l.status = $' + (params.length + 1)); params.push(status); }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY l.tahun DESC, l.bulan DESC';

    const result = await pool.query(query, params);

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rekap Laporan</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 20px; }
        h1 { font-size: 16px; border-bottom: 2px solid #1a56a8; padding-bottom: 6px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; font-size: 10px; }
        th { background: #f1f5f9; font-weight: 600; }
        .status-diteruskan { color: #059669; }
        .status-diajukan { color: #d97706; }
        .status-revisi_admin { color: #dc2626; }
        .footer { margin-top: 20px; text-align: right; font-size: 10px; color: #64748b; }
        @media print { body { padding: 10px; } }
      </style></head><body>
      <h1>Rekap Laporan Kinerja Bulanan — KSOP Kelas II Cirebon</h1>
      <table><thead><tr><th>No</th><th>Pegawai</th><th>NIP</th><th>Seksi</th><th>Bulan</th><th>Tahun</th><th>Status</th><th>Capaian</th><th>Kendala</th><th>Tgl Pengajuan</th><th>Tgl Verifikasi</th></tr></thead><tbody>`;

    result.rows.forEach((r, i) => {
      const cap = escapeHtml((r.capaian || '').substring(0, 60));
      const kend = escapeHtml((r.kendala || '').substring(0, 40));
      html += `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.nama_pegawai)}</td>
        <td>${escapeHtml(r.nip || '-')}</td>
        <td>${escapeHtml(r.nama_seksi || '-')}</td>
        <td>${escapeHtml(r.bulan)}</td><td>${escapeHtml(r.tahun)}</td>
        <td class="${statusClass(r.status)}">${escapeHtml(r.status.replace(/_/g, ' '))}</td>
        <td>${cap}${(r.capaian || '').length > 60 ? '...' : ''}</td>
        <td>${kend}${(r.kendala || '').length > 40 ? '...' : ''}</td>
        <td>${r.tanggal_pengajuan ? new Date(r.tanggal_pengajuan).toLocaleDateString('id-ID') : '-'}</td>
        <td>${r.tanggal_verifikasi ? new Date(r.tanggal_verifikasi).toLocaleDateString('id-ID') : '-'}</td>
      </tr>`;
    });

    html += `</tbody></table>
      <div class="footer">Dicetak pada: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
      <script>window.onload = function() { window.print(); }</script>
    </body></html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Error exporting PDF:', error);
    res.status(500).json({ success: false, message: 'Gagal export PDF' });
  }
});

module.exports = router;
