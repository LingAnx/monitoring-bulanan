const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/kepala/dashboard - Complete dashboard data for Kepala Kantor
router.get('/dashboard', authenticateToken, requireRole('KEPALA_KANTOR'), async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Office info
    const office = { id: 'office_01', name: 'KSOP Cirebon' };

    // Active period
    const activePeriod = {
      id: `period_${currentYear}_${String(currentMonth).padStart(2, '0')}`,
      name: `Agustus ${currentYear}`,
      startDate: `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`,
      deadline: `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`,
      isActive: true
    };

    // Summary counts for current period
    const totalPegawai = await pool.query("SELECT COUNT(*) as cnt FROM users WHERE role = 'PEGAWAI'");
    const totalLaporan = await pool.query('SELECT COUNT(*) as cnt FROM laporan WHERE bulan = $1 AND tahun = $2', [currentMonth, currentYear]);
    const pendingApproval = await pool.query("SELECT COUNT(*) as cnt FROM laporan WHERE status = 'diteruskan' AND bulan = $1 AND tahun = $2", [currentMonth, currentYear]);
    const approved = await pool.query("SELECT COUNT(*) as cnt FROM laporan WHERE status = 'disetujui' AND bulan = $1 AND tahun = $2", [currentMonth, currentYear]);
    const revision = await pool.query("SELECT COUNT(*) as cnt FROM laporan WHERE status = 'revisi_kantor' AND bulan = $1 AND tahun = $2", [currentMonth, currentYear]);
    const notSubmitted = await pool.query(
      `SELECT COUNT(*) as cnt FROM users u
       LEFT JOIN laporan l ON u.id = l.id_user AND l.bulan = $1 AND l.tahun = $2 AND l.status != 'draft'
       WHERE u.role = 'PEGAWAI' AND l.id IS NULL`,
      [currentMonth, currentYear]
    );
    const pendingVerification = await pool.query("SELECT COUNT(*) as cnt FROM laporan WHERE status = 'diajukan' AND bulan = $1 AND tahun = $2", [currentMonth, currentYear]);
    const draftCount = await pool.query("SELECT COUNT(*) as cnt FROM laporan WHERE status = 'draft' AND bulan = $1 AND tahun = $2", [currentMonth, currentYear]);

    // Office progress
    const totalEmp = parseInt(totalPegawai.rows[0].cnt);
    const submitted = parseInt(totalLaporan.rows[0].cnt) - parseInt(draftCount.rows[0].cnt);
    const progressPct = totalEmp > 0 ? Math.round((submitted / totalEmp) * 100) : 0;

    // Pending reports (top 5 longest waiting, ordered by tanggal_verifikasi DESC)
    const pendingReports = await pool.query(`
      SELECT l.*, u.nama, u.nip, u.role as user_role, s.nama_seksi,
             v.catatan as catatan_admin, v.created_at as verifikasinya_at,
             uv.nama as admin_nama
      FROM laporan l
      JOIN users u ON l.id_user = u.id
      LEFT JOIN seksi s ON u.id_seksi = s.id
      LEFT JOIN verifikasi v ON v.id_laporan = l.id
      LEFT JOIN users uv ON v.id_admin_seksi = uv.id
      WHERE l.status = 'diteruskan' AND l.bulan = $1 AND l.tahun = $2
      ORDER BY COALESCE(v.created_at, l.created_at) ASC
      LIMIT 5
    `, [currentMonth, currentYear]);

    // Section progress
    const sections = await pool.query(`
      SELECT s.id, s.nama_seksi,
        COUNT(DISTINCT u.id) as total_pegawai,
        COUNT(DISTINCT CASE WHEN l.id IS NOT NULL THEN l.id END) as submitted,
        COUNT(DISTINCT CASE WHEN l.status = 'disetujui' THEN l.id END) as approved,
        COUNT(DISTINCT CASE WHEN l.status = 'diteruskan' THEN l.id END) as pending_approval,
        COUNT(DISTINCT CASE WHEN l.status = 'diajukan' THEN l.id END) as pending_verification,
        COUNT(DISTINCT CASE WHEN l.status = 'revisi_kantor' OR l.status = 'revisi_admin' THEN l.id END) as revision
      FROM seksi s
      LEFT JOIN users u ON s.id = u.id_seksi AND u.role = 'PEGAWAI'
      LEFT JOIN laporan l ON u.id = l.id_user AND l.bulan = $1 AND l.tahun = $2
      GROUP BY s.id, s.nama_seksi
      ORDER BY s.id
    `, [currentMonth, currentYear]);

    // Status distribution for chart
    const allStatus = await pool.query(`
      SELECT status, COUNT(*) as count FROM laporan
      WHERE bulan = $1 AND tahun = $2
      GROUP BY status
    `, [currentMonth, currentYear]);
    const statusDist = {};
    allStatus.rows.forEach(r => { statusDist[r.status] = parseInt(r.count); });

    // Recent approvals (last 10)
    const recentApprovals = await pool.query(`
      SELECT p.*, l.judul, l.bulan, l.tahun,
             u.nama as pegawai_nama, s.nama_seksi,
             k.nama as kepala_nama,
             l.status as laporan_status
      FROM persetujuan p
      JOIN laporan l ON p.id_laporan = l.id
      JOIN users u ON l.id_user = u.id
      LEFT JOIN seksi s ON u.id_seksi = s.id
      JOIN users k ON p.id_kepala = k.id
      WHERE p.status IN ('disetujui', 'revisi_kantor')
      ORDER BY p.created_at DESC
      LIMIT 10
    `);

    // Recent activities
    const recentActivities = await pool.query(`
      SELECT a.*, u.nama as actor_name, l.judul, l.bulan, l.tahun,
             l.status as laporan_status
      FROM audit_trail a
      LEFT JOIN users u ON a.id_user = u.id
      LEFT JOIN laporan l ON a.id_laporan = l.id
      ORDER BY a.created_at DESC
      LIMIT 15
    `);

    // Priority alerts
    const pendingCount = parseInt(pendingApproval.rows[0].cnt);
    const over2Days = await pool.query(`
      SELECT COUNT(*) as cnt FROM laporan l
      JOIN verifikasi v ON v.id_laporan = l.id
      WHERE l.status = 'diteruskan' AND l.bulan = $1 AND l.tahun = $2
        AND v.created_at < NOW() - INTERVAL '2 days'
    `, [currentMonth, currentYear]);
    const over2DaysCount = parseInt(over2Days.rows[0].cnt);

    // Notifications
    const notifResult = await pool.query(
      'SELECT * FROM notifications WHERE id_user = $1 ORDER BY created_at DESC LIMIT 5',
      [req.user.id]
    );
    const totalUnread = await pool.query(
      'SELECT COUNT(*) as cnt FROM notifications WHERE id_user = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        office,
        activePeriod,
        summary: {
          totalPegawai: totalEmp,
          totalReports: parseInt(totalLaporan.rows[0].cnt),
          pendingApproval,
          approved,
          revision: parseInt(revision.rows[0].cnt),
          notSubmitted: parseInt(notSubmitted.rows[0].cnt)
        },
        summaryCounts: {
          totalPegawai: totalEmp,
          totalReports: parseInt(totalLaporan.rows[0].cnt),
          pendingApproval: parseInt(pendingApproval.rows[0].cnt),
          approved: parseInt(approved.rows[0].cnt),
          revision: parseInt(revision.rows[0].cnt),
          notSubmitted: parseInt(notSubmitted.rows[0].cnt),
          pendingVerification: parseInt(pendingVerification.rows[0].cnt),
          draft: parseInt(draftCount.rows[0].cnt)
        },
        officeProgress: {
          submitted,
          totalEmployees: totalEmp,
          percentage: progressPct
        },
        pendingReports: pendingReports.rows,
        sections: sections.rows,
        statusDistribution: statusDist,
        recentApprovals: recentApprovals.rows,
        recentActivities: recentActivities.rows,
        priorityAlerts: {
          hasPending: pendingCount > 0,
          pendingCount,
          over2Days: over2DaysCount,
          notSubmitted: parseInt(notSubmitted.rows[0].cnt)
        },
        notifications: notifResult.rows,
        unreadNotifications: parseInt(totalUnread.rows[0].cnt)
      }
    });
  } catch (error) {
    console.error('Error fetching head-office dashboard:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat dashboard' });
  }
});

// GET /api/kepala/reports - All reports with filters
router.get('/reports', authenticateToken, requireRole('KEPALA_KANTOR'), async (req, res) => {
  try {
    const { bulan, tahun, status, search, limit = 50 } = req.query;
    let query = `
      SELECT l.*, u.nama as user_nama, u.nip, s.nama_seksi
      FROM laporan l
      JOIN users u ON l.id_user = u.id
      LEFT JOIN seksi s ON u.id_seksi = s.id
    `;
    const params = [];
    const conditions = [];

    if (bulan) { conditions.push('l.bulan = $' + (params.length + 1)); params.push(parseInt(bulan)); }
    if (tahun) { conditions.push('l.tahun = $' + (params.length + 1)); params.push(parseInt(tahun)); }
    if (status) { conditions.push('l.status = $' + (params.length + 1)); params.push(status); }
    if (search) { conditions.push('(l.judul ILIKE $' + (params.length + 1) + " OR u.nama ILIKE $" + (params.length + 1) + ')'); params.push('%' + search + '%'); }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY l.tahun DESC, l.bulan DESC, l.created_at DESC LIMIT $' + (params.length + 1);
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat laporan' });
  }
});

// GET /api/kepala/reports/pending - Reports pending approval
router.get('/reports/pending', authenticateToken, requireRole('KEPALA_KANTOR'), async (req, res) => {
  try {
    const { bulan, tahun } = req.query;
    const b = bulan ? parseInt(bulan) : new Date().getMonth() + 1;
    const t = tahun ? parseInt(tahun) : new Date().getFullYear();

    const result = await pool.query(`
      SELECT l.*, u.nama, u.nip, s.nama_seksi,
             v.catatan as catatan_admin, v.created_at as tanggal_verifikasi,
             uv.nama as admin_nama
      FROM laporan l
      JOIN users u ON l.id_user = u.id
      LEFT JOIN seksi s ON u.id_seksi = s.id
      LEFT JOIN verifikasi v ON v.id_laporan = l.id
      LEFT JOIN users uv ON v.id_admin_seksi = uv.id
      WHERE l.status = 'diteruskan' AND l.bulan = $1 AND l.tahun = $2
      ORDER BY COALESCE(v.created_at, l.created_at) ASC
    `, [b, t]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching pending reports:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat laporan menunggu' });
  }
});

// GET /api/kepala/reports/approved - Approved reports
router.get('/reports/approved', authenticateToken, requireRole('KEPALA_KANTOR'), async (req, res) => {
  try {
    const { bulan, tahun } = req.query;
    const b = bulan ? parseInt(bulan) : new Date().getMonth() + 1;
    const t = tahun ? parseInt(tahun) : new Date().getFullYear();

    const result = await pool.query(`
      SELECT l.*, u.nama as user_nama, u.nip, s.nama_seksi,
             p.catatan as catatan_kantor, p.created_at as tanggal_persetujuan
      FROM laporan l
      JOIN users u ON l.id_user = u.id
      LEFT JOIN seksi s ON u.id_seksi = s.id
      LEFT JOIN persetujuan p ON p.id_laporan = l.id
      WHERE l.status = 'disetujui' AND l.bulan = $1 AND l.tahun = $2
      ORDER BY p.created_at DESC
    `, [b, t]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching approved reports:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat laporan disetujui' });
  }
});

// GET /api/kepala/reports/revision - Reports needing revision
router.get('/reports/revision', authenticateToken, requireRole('KEPALA_KANTOR'), async (req, res) => {
  try {
    const { bulan, tahun } = req.query;
    const b = bulan ? parseInt(bulan) : new Date().getMonth() + 1;
    const t = tahun ? parseInt(tahun) : new Date().getFullYear();

    const result = await pool.query(`
      SELECT l.*, u.nama as user_nama, u.nip, s.nama_seksi,
             p.catatan as catatan_kantor, p.created_at as tanggal_permintaan
      FROM laporan l
      JOIN users u ON l.id_user = u.id
      LEFT JOIN seksi s ON u.id_seksi = s.id
      LEFT JOIN persetujuan p ON p.id_laporan = l.id
      WHERE l.status = 'revisi_kantor' AND l.bulan = $1 AND l.tahun = $2
      ORDER BY p.created_at DESC
    `, [b, t]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching revision reports:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat laporan revisi' });
  }
});

// POST /api/kepala/reports/:id/approve - Approve a report
router.post('/reports/:id/approve', authenticateToken, requireRole('KEPALA_KANTOR'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, catatan } = req.body;
    if (!['disetujui', 'revisi_kantor'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid' });
    }

    const laporan = await pool.query('SELECT * FROM laporan WHERE id = $1', [id]);
    if (laporan.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan' });
    }
    if (laporan.rows[0].status !== 'diteruskan') {
      return res.status(400).json({ success: false, message: 'Hanya laporan yang sudah diverifikasi admin dapat disetujui' });
    }

    const newStatus = status === 'disetujui' ? 'disetujui' : 'revisi_kantor';
    const updateResult = await pool.query(
      "UPDATE laporan SET status=$1, catatan_kantor=$2, tanggal_persetujuan=CURRENT_TIMESTAMP WHERE id=$3 RETURNING *",
      [newStatus, catatan || null, id]
    );

    await pool.query(
      "INSERT INTO persetujuan (id_laporan, id_kepala, status, catatan) VALUES ($1, $2, $3, $4)",
      [id, req.user.id, status, catatan || null]
    );

    await pool.query(
      "INSERT INTO audit_trail (id_laporan, id_user, action, detail) VALUES ($1, $2, $3, $4)",
      [id, req.user.id, status === 'disetujui' ? 'approve' : 'request_revision',
       status === 'disetujui' ? 'Laporan disetujui' : 'Laporan diminta revisi oleh Kepala Kantor']
    );

    const laporanUser = await pool.query('SELECT id, nama FROM users WHERE id = $1', [laporan.rows[0].id_user]);
    if (laporanUser.rows[0]) {
      const notifType = status === 'disetujui' ? 'success' : 'warning';
      const notifMsg = status === 'disetujui'
        ? `"${laporan.rows[0].judul}" telah disetujui oleh Kepala Kantor.`
        : `"${laporan.rows[0].judul}" diminta revisi oleh Kepala Kantor.`;
      await pool.query(
        "INSERT INTO notifications (id_user, title, message, type) VALUES ($1, $2, $3, $4)",
        [laporanUser.rows[0].id, 'Status Laporan Diperbarui', notifMsg, notifType]
      );
    }

    res.json({ success: true, data: updateResult.rows[0] });
  } catch (error) {
    console.error('Error approving report:', error);
    res.status(500).json({ success: false, message: 'Gagal memproses persetujuan' });
  }
});

// GET /api/kepala/sections - Section monitoring
router.get('/sections', authenticateToken, requireRole('KEPALA_KANTOR'), async (req, res) => {
  try {
    const { bulan, tahun } = req.query;
    const b = bulan ? parseInt(bulan) : new Date().getMonth() + 1;
    const t = tahun ? parseInt(tahun) : new Date().getFullYear();

    const result = await pool.query(`
      SELECT s.id, s.nama_seksi,
        COUNT(DISTINCT u.id) as total_pegawai,
        COUNT(DISTINCT CASE WHEN l.id IS NOT NULL THEN l.id END) as submitted,
        COUNT(DISTINCT CASE WHEN l.status = 'disetujui' THEN l.id END) as approved,
        COUNT(DISTINCT CASE WHEN l.status = 'diteruskan' THEN l.id END) as pending_approval,
        COUNT(DISTINCT CASE WHEN l.status = 'diajukan' THEN l.id END) as pending_verification,
        COUNT(DISTINCT CASE WHEN l.status IN ('revisi_admin', 'revisi_kantor') THEN l.id END) as revision,
        COUNT(DISTINCT CASE WHEN l.id IS NULL OR l.status = 'draft' THEN u.id END) as not_submitted
      FROM seksi s
      LEFT JOIN users u ON s.id = u.id_seksi AND u.role = 'PEGAWAI'
      LEFT JOIN laporan l ON u.id = l.id_user AND l.bulan = $1 AND l.tahun = $2
      GROUP BY s.id, s.nama_seksi
      ORDER BY s.id
    `, [b, t]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching sections:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat data seksi' });
  }
});

// GET /api/kepala/sections/:id - Section detail
router.get('/sections/:id', authenticateToken, requireRole('KEPALA_KANTOR'), async (req, res) => {
  try {
    const { id } = req.params;
    const { bulan, tahun } = req.query;
    const b = bulan ? parseInt(bulan) : new Date().getMonth() + 1;
    const t = tahun ? parseInt(tahun) : new Date().getFullYear();

    const sek = await pool.query('SELECT * FROM seksi WHERE id = $1', [id]);
    if (sek.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Seksi tidak ditemukan' });
    }

    const pegawai = await pool.query(`
      SELECT u.id, u.nama, u.nip,
             CASE WHEN l.id IS NOT NULL THEN true ELSE false END as sudah_lapor,
             l.status as laporan_status,
             l.id as laporan_id
      FROM users u
      LEFT JOIN laporan l ON u.id = l.id_user AND l.bulan = $1 AND l.tahun = $2
      WHERE u.id_seksi = $3 AND u.role = 'PEGAWAI'
      ORDER BY u.nama
    `, [b, t, id]);

    res.json({ success: true, data: { section: sek.rows[0], pegawai: pegawai.rows } });
  } catch (error) {
    console.error('Error fetching section detail:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat detail seksi' });
  }
});

// GET /api/kepala/history - Approval history
router.get('/history', authenticateToken, requireRole('KEPALA_KANTOR'), async (req, res) => {
  try {
    const { bulan, tahun, status } = req.query;
    let query = `
      SELECT p.*, l.judul, l.bulan, l.tahun,
             u.nama as pegawai_nama, u.nip, s.nama_seksi,
             k.nama as kepala_nama
      FROM persetujuan p
      JOIN laporan l ON p.id_laporan = l.id
      JOIN users u ON l.id_user = u.id
      LEFT JOIN seksi s ON u.id_seksi = s.id
      JOIN users k ON p.id_kepala = k.id
    `;
    const params = [];
    const conditions = [];

    if (bulan) { conditions.push('l.bulan = $' + (params.length + 1)); params.push(parseInt(bulan)); }
    if (tahun) { conditions.push('l.tahun = $' + (params.length + 1)); params.push(parseInt(tahun)); }
    if (status) { conditions.push('p.status = $' + (params.length + 1)); params.push(status); }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY p.created_at DESC';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat riwayat' });
  }
});

// GET /api/kepala/archive - Archive approved reports
router.get('/archive', authenticateToken, requireRole('KEPALA_KANTOR'), async (req, res) => {
  try {
    const { bulan, tahun, search, limit = 100 } = req.query;
    let query = `
      SELECT l.*, u.nama as user_nama, u.nip, s.nama_seksi,
             p.catatan as catatan_kantor, p.created_at as tanggal_persetujuan
      FROM laporan l
      JOIN users u ON l.id_user = u.id
      LEFT JOIN seksi s ON u.id_seksi = s.id
      LEFT JOIN persetujuan p ON p.id_laporan = l.id
      WHERE l.status = 'disetujui'
    `;
    const params = [];

    if (bulan) { params.push(parseInt(bulan)); query += ' AND l.bulan = $' + params.length; }
    if (tahun) { params.push(parseInt(tahun)); query += ' AND l.tahun = $' + params.length; }
    if (search) { params.push('%' + search + '%'); query += ' AND (l.judul ILIKE $' + params.length + " OR u.nama ILIKE $" + params.length + ')'; }

    query += ' ORDER BY p.created_at DESC LIMIT $' + (params.length + 1);
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching archive:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat arsip' });
  }
});

module.exports = router;
