const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

// GET /api/admin-section/dashboard - Full dashboard data for admin_seksi
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN_SEKSI') {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }

    const sekId = req.user.id_seksi;
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // ── Stats ──
    const totalPegawai = await pool.query(
      'SELECT COUNT(*) as cnt FROM users WHERE role = \'PEGAWAI\' AND id_seksi = $1',
      [sekId]
    );
    const draftCount = await pool.query(
      'SELECT COUNT(*) as cnt FROM laporan l JOIN users u ON l.id_user = u.id WHERE u.id_seksi = $1 AND l.status = \'draft\'', [sekId]
    );
    const pendingCount = await pool.query(
      'SELECT COUNT(*) as cnt FROM laporan l JOIN users u ON l.id_user = u.id WHERE u.id_seksi = $1 AND l.status = \'diajukan\'', [sekId]
    );
    const revisiCount = await pool.query(
      'SELECT COUNT(*) as cnt FROM laporan l JOIN users u ON l.id_user = u.id WHERE u.id_seksi = $1 AND l.status IN (\'revisi_admin\', \'revisi_kantor\')', [sekId]
    );
    const approvedCount = await pool.query(
      'SELECT COUNT(*) as cnt FROM laporan l JOIN users u ON l.id_user = u.id WHERE u.id_seksi = $1 AND l.status = \'disetujui\'', [sekId]
    );
    const verifiedCount = await pool.query(
      'SELECT COUNT(*) as cnt FROM laporan l JOIN users u ON l.id_user = u.id WHERE u.id_seksi = $1 AND l.status = \'diteruskan\'', [sekId]
    );

    // ── Period ──
    const periodResult = await pool.query(
      `SELECT * FROM periode_laporan WHERE bulan = $1 AND tahun = $2 AND status = 'aktif'`, [month, year]
    );
    const period = periodResult.rows[0] || null;

    // ── Completion rate for current period (section only) ──
    // NUMERATOR dan DENOMINATOR harus memakai seksi + bulan + tahun
    // yang SAMA (periode aktif), dan "selesai" didefinisikan secara
    // eksplisit: status 'disetujui' ATAU 'diteruskan'.
    // Draft/diajukan/revisi dihitung belum selesai (masih masuk
    // denominator). Satu query conditional aggregation — tanpa N+1.
    const compRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE l.status IN ('disetujui', 'diteruskan')) AS done,
         COUNT(*) FILTER (WHERE l.status IN ('draft', 'diajukan', 'revisi_admin', 'revisi_kantor', 'disetujui', 'diteruskan')) AS total
       FROM laporan l
       JOIN users u ON u.id = l.id_user
       WHERE u.id_seksi = $1 AND l.bulan = $2 AND l.tahun = $3`,
      [sekId, month, year]
    );
    const totalForPeriodCount = parseInt(compRes.rows[0].total, 10) || 0;
    const completedCount = parseInt(compRes.rows[0].done, 10) || 0;
    // Pastikan hasil selalu dalam rentang 0–100.
    const completionRate = totalForPeriodCount > 0
      ? Math.min(100, Math.max(0, Math.round((completedCount / totalForPeriodCount) * 100)))
      : 0;

    // ── Deadline info ──
    let deadlineInfo = null;
    if (period && period.deadline) {
      const deadline = new Date(period.deadline);
      const diff = deadline - now;
      const daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
      deadlineInfo = {
        deadlineDate: period.deadline,
        daysRemaining: Math.max(0, daysRemaining),
        isUrgent: daysRemaining <= 3
      };
    }

    // ── Activity timeline (last 5 reports) ──
    const activities = await pool.query(
      `SELECT l.id, l.status, l.created_at,
              u.nama as nama_pegawai,
              (SELECT action FROM audit_trail WHERE id_laporan = l.id ORDER BY created_at DESC LIMIT 1) as last_action
       FROM laporan l JOIN users u ON l.id_user = u.id
       WHERE u.id_seksi = $1
       ORDER BY l.created_at DESC
       LIMIT 5`,
      [sekId]
    );

    // ── Notifications (latest 5 for all users in this section) ──
    const notifications = await pool.query(
      `SELECT n.id, n.id_user, n.title, n.message, n.type, n.is_read, n.created_at,
              u.nama, u.username
       FROM notifications n
       JOIN users u ON n.id_user = u.id
       WHERE u.id_seksi = $1
       ORDER BY n.created_at DESC
       LIMIT 5`,
      [sekId]
    );

    res.json({
      success: true,
      stats: {
        total_pegawai: parseInt(totalPegawai.rows[0].cnt),
        draft: parseInt(draftCount.rows[0].cnt),
        pending: parseInt(pendingCount.rows[0].cnt),
        revisi: parseInt(revisiCount.rows[0].cnt),
        diverifikasi: parseInt(verifiedCount.rows[0].cnt),
        disetujui: parseInt(approvedCount.rows[0].cnt),
        completion_rate: completionRate
      },
      period,
      deadline: deadlineInfo,
      activities: activities.rows,
      notifications: notifications.rows
    });
  } catch (error) {
    logger.error('Error fetching admin-section dashboard', { error: error.message });
    res.status(500).json({ success: false, message: 'Gagal memuat dashboard' });
  }
});

module.exports = router;
