const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT l.*, u.nama as user_nama, u.username, u.id_seksi, s.nama_seksi
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

    const { bulan, tahun, status, page = 1, limit = 50 } = req.query;
    if (bulan) {
      conditions.push('l.bulan = $' + (params.length + 1));
      params.push(parseInt(bulan));
    }
    if (tahun) {
      conditions.push('l.tahun = $' + (params.length + 1));
      params.push(parseInt(tahun));
    }
    if (status) {
      conditions.push('l.status = $' + (params.length + 1));
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY l.created_at DESC';

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    // Get total count for pagination metadata
    let countQuery = 'SELECT COUNT(*) as total FROM laporan l';
    const countParams = [];
    if (req.user.role === 'PEGAWAI') {
      countQuery += ' WHERE l.id_user = $1';
      countParams.push(req.user.id);
    } else if (req.user.role === 'ADMIN_SEKSI') {
      countQuery += ' JOIN users u ON l.id_user = u.id WHERE u.id_seksi = $1';
      countParams.push(req.user.id_seksi);
    }
    if (bulan) {
      countQuery += countParams.length ? ' AND' : ' WHERE';
      countQuery += ' l.bulan = $' + (countParams.length + 1);
      countParams.push(parseInt(bulan));
    }
    if (tahun) {
      countQuery += countParams.length ? ' AND' : ' WHERE';
      countQuery += ' l.tahun = $' + (countParams.length + 1);
      countParams.push(parseInt(tahun));
    }
    if (status) {
      countQuery += countParams.length ? ' AND' : ' WHERE';
      countQuery += ' l.status = $' + (countParams.length + 1);
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching laporan:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat laporan' });
  }
});

// GET /api/laporan/stats - Dashboard stats (optimized with conditional aggregation)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = {};

    if (req.user.role === 'PEGAWAI') {
      // Single query with conditional aggregation
      const result = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'draft') as draft,
          COUNT(*) FILTER (WHERE status = 'diajukan') as submitted,
          COUNT(*) FILTER (WHERE status = 'disetujui') as approved
        FROM laporan WHERE id_user = $1
      `, [req.user.id]);
      const r = result.rows[0];
      stats.total = parseInt(r.total);
      stats.draft = parseInt(r.draft);
      stats.submitted = parseInt(r.submitted);
      stats.approved = parseInt(r.approved);
    } else if (req.user.role === 'ADMIN_SEKSI') {
      // Single query for all stats
      const result = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'diajukan') as pending,
          COUNT(*) FILTER (WHERE status IN ('diverifikasi', 'diteruskan')) as verified,
          COUNT(*) FILTER (WHERE status = 'revisi_admin') as rejected
        FROM laporan l
        JOIN users u ON l.id_user = u.id
        WHERE u.id_seksi = $1
      `, [req.user.id_seksi]);
      const r = result.rows[0];
      stats.total = parseInt(r.total);
      stats.pending = parseInt(r.pending);
      stats.verified = parseInt(r.verified);
      stats.rejected = parseInt(r.rejected);

      const bySeksi = await pool.query('SELECT s.nama_seksi FROM seksi s WHERE s.id = $1', [req.user.id_seksi]);
      stats.bySeksi = bySeksi.rows;
    } else if (req.user.role === 'KEPALA_KANTOR') {
      // Single query for all stats
      const result = await pool.query(`
        SELECT
          COUNT(DISTINCT u.id) as total_pegawai,
          COUNT(l.id) as total_laporan,
          COUNT(*) FILTER (WHERE l.status = 'diteruskan') as pending,
          COUNT(*) FILTER (WHERE l.status = 'disetujui') as approved,
          COUNT(*) FILTER (WHERE l.status IN ('revisi_admin', 'revisi_kantor')) as rejected
        FROM users u
        LEFT JOIN laporan l ON u.id = l.id_user
        WHERE u.role = 'PEGAWAI'
      `);
      const r = result.rows[0];
      stats.total = parseInt(r.total_pegawai);
      stats.totalLaporan = parseInt(r.total_laporan);
      stats.pending = parseInt(r.pending);
      stats.approved = parseInt(r.approved);
      stats.rejected = parseInt(r.rejected);

      const bySeksi = await pool.query(`
        SELECT s.nama_seksi, COUNT(DISTINCT u.id) as total_pegawai, COUNT(DISTINCT l.id) as total_laporan
        FROM seksi s
        LEFT JOIN users u ON s.id = u.id_seksi AND u.role = 'PEGAWAI'
        LEFT JOIN laporan l ON u.id = l.id_user
        GROUP BY s.id, s.nama_seksi
        ORDER BY s.id
      `);
      stats.bySeksi = bySeksi.rows;
    }

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat statistik' });
  }
});

// POST /api/laporan - Create laporan
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { judul, bulan, tahun, isi_kegiatan, capaian, kendala, tindak_lanjut, rencana_bulan_depan } = req.body;
    if (!judul || !bulan || !tahun) {
      return res.status(400).json({ success: false, message: 'Judul, bulan, dan tahun wajib diisi' });
    }
    const result = await pool.query(
      `INSERT INTO laporan (id_user, judul, bulan, tahun, isi_kegiatan, capaian, kendala, tindak_lanjut, rencana_bulan_depan, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
       RETURNING *`,
      [req.user.id, judul, bulan, tahun,
       isi_kegiatan || null, capaian || null, kendala || null,
       tindak_lanjut || null, rencana_bulan_depan || null]
    );
    const laporan = result.rows[0];
    await pool.query(
      "INSERT INTO audit_trail (id_laporan, id_user, action, detail) VALUES ($1, $2, $3, $4)",
      [laporan.id, req.user.id, 'create', 'Laporan dibuat']
    );
    res.status(201).json({ success: true, data: laporan });
  } catch (error) {
    console.error('Error creating laporan:', error);
    res.status(500).json({ success: false, message: 'Gagal membuat laporan' });
  }
});

// PUT /api/laporan/:id - Update laporan (only draft or revisi)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { judul, bulan, tahun, isi_kegiatan, capaian, kendala, tindak_lanjut, rencana_bulan_depan } = req.body;

    const result = await pool.query('SELECT * FROM laporan WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan' });
    }
    const laporan = result.rows[0];
    if (laporan.id_user !== req.user.id && req.user.role !== 'SUPERADMIN') {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }
    if (!['draft', 'revisi_admin', 'revisi_kantor'].includes(laporan.status)) {
      return res.status(400).json({ success: false, message: 'Hanya laporan draft atau perlu revisi yang dapat diedit' });
    }

    const updateResult = await pool.query(
      `UPDATE laporan SET judul=$1, bulan=$2, tahun=$3, isi_kegiatan=$4, capaian=$5, kendala=$6, tindak_lanjut=$7, rencana_bulan_depan=$8, updated_at=CURRENT_TIMESTAMP
       WHERE id=$9 RETURNING *`,
      [judul, bulan, tahun, isi_kegiatan, capaian, kendala, tindak_lanjut, rencana_bulan_depan, id]
    );

    await pool.query(
      "INSERT INTO audit_trail (id_laporan, id_user, action, detail) VALUES ($1, $2, $3, $4)",
      [id, req.user.id, 'update', 'Laporan diperbarui']
    );

    res.json({ success: true, data: updateResult.rows[0] });
  } catch (error) {
    console.error('Error updating laporan:', error);
    res.status(500).json({ success: false, message: 'Gagal memperbarui laporan' });
  }
});

// POST /api/laporan/:id/submit - Submit for review
router.post('/:id/submit', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM laporan WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan' });
    }
    const laporan = result.rows[0];
    if (laporan.id_user !== req.user.id && req.user.role !== 'SUPERADMIN') {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }
    if (laporan.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Hanya laporan draft yang dapat diajukan' });
    }

    const updateResult = await pool.query(
      "UPDATE laporan SET status='diajukan', tanggal_pengajuan=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",
      [id]
    );

    await pool.query(
      "INSERT INTO audit_trail (id_laporan, id_user, action, detail) VALUES ($1, $2, $3, $4)",
      [id, req.user.id, 'submit', 'Laporan diajukan untuk review']
    );

    // Notify admin_seksi that a report needs verification
    const targetUser = await pool.query('SELECT id FROM users WHERE id = $1', [laporan.id_user]);
    if (targetUser.rows[0]) {
      await pool.query(
        `INSERT INTO notifications (id_user, title, message, type)
         SELECT us.id_seksi, 'Laporan Baru Diajukan', $1 || ' telah diajukan oleh ' || u.nama, 'info'
         FROM users u JOIN users us ON u.id = $2 WHERE us.role = 'ADMIN_SEKSI' AND us.id_seksi = u.id_seksi`,
        [laporan.judul, laporan.id_user]
      );
    }

    res.json({ success: true, data: updateResult.rows[0] });
  } catch (error) {
    console.error('Error submitting laporan:', error);
    res.status(500).json({ success: false, message: 'Gagal mengajukan laporan' });
  }
});

// POST /api/laporan/:id/verify - Admin Seksi verify
router.post('/:id/verify', authenticateToken, requireRole('ADMIN_SEKSI'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, catatan } = req.body;
    if (!['diverifikasi', 'revisi_admin'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid' });
    }

    const laporan = await pool.query('SELECT * FROM laporan l JOIN users u ON l.id_user = u.id WHERE l.id = $1', [id]);
    if (laporan.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan' });
    }
    if (laporan.rows[0].id_seksi !== req.user.id_seksi) {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }

    const newStatus = status === 'diverifikasi' ? 'diteruskan' : 'revisi_admin';
    const updateResult = await pool.query(
      "UPDATE laporan SET status=$1, catatan_admin=$2, tanggal_verifikasi=CURRENT_TIMESTAMP WHERE id=$3 RETURNING *",
      [newStatus, catatan || null, id]
    );

    await pool.query(
      "INSERT INTO verifikasi (id_laporan, id_admin_seksi, status, catatan) VALUES ($1, $2, $3, $4)",
      [id, req.user.id, status, catatan || null]
    );

    await pool.query(
      "INSERT INTO audit_trail (id_laporan, id_user, action, detail) VALUES ($1, $2, $3, $4)",
      [id, req.user.id, 'verify', status === 'diverifikasi' ? 'Laporan diverifikasi' : 'Laporan diminta revisi']
    );

    // Notify the pegawai
    const laporanUser = await pool.query('SELECT id, nama FROM users WHERE id = $1', [laporan.rows[0].id_user]);
    if (laporanUser.rows[0]) {
      const notifType = status === 'diverifikasi' ? 'success' : 'warning';
      const notifMsg = status === 'diverifikasi'
        ? `"${laporan.rows[0].judul}" telah diverifikasi oleh Admin Seksi.`
        : `"${laporan.rows[0].judul}" diminta revisi oleh Admin Seksi.`;
      await pool.query(
        "INSERT INTO notifications (id_user, title, message, type) VALUES ($1, $2, $3, $4)",
        [laporanUser.rows[0].id, 'Status Laporan Diperbarui', notifMsg, notifType]
      );
    }

    res.json({ success: true, data: updateResult.rows[0] });
  } catch (error) {
    console.error('Error verifying laporan:', error);
    res.status(500).json({ success: false, message: 'Gagal memverifikasi laporan' });
  }
});

// POST /api/laporan/:id/approve - Kepala Kantor approve/reject
router.post('/:id/approve', authenticateToken, requireRole('KEPALA_KANTOR'), async (req, res) => {
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
      [id, req.user.id, 'approve', status === 'disetujui' ? 'Laporan disetujui' : 'Laporan diminta revisi oleh kepala']
    );

    // Notify the pegawai
    const laporanUser2 = await pool.query('SELECT id, nama FROM users WHERE id = $1', [laporan.rows[0].id_user]);
    if (laporanUser2.rows[0]) {
      const notifType = status === 'disetujui' ? 'success' : 'warning';
      const notifMsg = status === 'disetujui'
        ? `"${laporan.rows[0].judul}" telah disetujui oleh Kepala Kantor.`
        : `"${laporan.rows[0].judul}" diminta revisi oleh Kepala Kantor.`;
      await pool.query(
        "INSERT INTO notifications (id_user, title, message, type) VALUES ($1, $2, $3, $4)",
        [laporanUser2.rows[0].id, 'Status Laporan Disetujui', notifMsg, notifType]
      );
    }

    res.json({ success: true, data: updateResult.rows[0] });
  } catch (error) {
    console.error('Error approving laporan:', error);
    res.status(500).json({ success: false, message: 'Gagal memproses persetujuan' });
  }
});

// GET /api/laporan/:id - Get single laporan
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT l.*, u.nama as user_nama, u.username, u.nip, s.nama_seksi
      FROM laporan l
      JOIN users u ON l.id_user = u.id
      LEFT JOIN seksi s ON u.id_seksi = s.id
      WHERE l.id = $1
    `, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan' });
    }
    const laporan = result.rows[0];
    if (req.user.role === 'PEGAWAI' && laporan.id_user !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }
    res.json({ success: true, data: laporan });
  } catch (error) {
    console.error('Error fetching laporan:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat laporan' });
  }
});

// GET /api/laporan/:id/audit - Get audit trail
router.get('/:id/audit', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT a.*, u.nama as user_nama, u.username
      FROM audit_trail a
      LEFT JOIN users u ON a.id_user = u.id
      WHERE a.id_laporan = $1
      ORDER BY a.created_at DESC
    `, [id]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching audit:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat audit trail' });
  }
});

// GET /api/laporan/:id/verifikasi-history - Get verification history for a laporan
router.get('/:id/verifikasi-history', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT v.*, u.nama as admin_nama
      FROM verifikasi v
      JOIN users u ON v.id_admin_seksi = u.id
      WHERE v.id_laporan = $1
      ORDER BY v.created_at ASC
    `, [id]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching verifikasi history:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat riwayat verifikasi' });
  }
});

// DELETE /api/laporan/:id - Delete own draft report
router.delete(
  '/:id',
  authenticateToken,
  requireRole('PEGAWAI'),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const id = parseInt(req.params.id, 10);

      if (!Number.isInteger(id)) {
        return res.status(400).json({
          success: false,
          message: 'ID laporan tidak valid'
        });
      }

      await client.query('BEGIN');

      const result = await client.query(
        `SELECT id, id_user, status, judul
         FROM laporan
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          success: false,
          message: 'Laporan tidak ditemukan'
        });
      }

      const laporan = result.rows[0];

      if (laporan.id_user !== req.user.id) {
        await client.query('ROLLBACK');

        return res.status(403).json({
          success: false,
          message: 'Anda tidak memiliki akses untuk menghapus laporan ini'
        });
      }

      if (laporan.status !== 'draft') {
        await client.query('ROLLBACK');

        return res.status(409).json({
          success: false,
          message: 'Hanya laporan berstatus draft yang dapat dihapus'
        });
      }

      await client.query(
        `INSERT INTO audit_trail
         (id_laporan, id_user, action, detail)
         VALUES (NULL, $1, $2, $3)`,
        [
          req.user.id,
          'delete',
          `Laporan ID ${laporan.id} (${laporan.judul || '-'}) dihapus`
        ]
      );

      await client.query(
        'DELETE FROM laporan WHERE id = $1',
        [id]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Draft laporan berhasil dihapus'
      });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {}

      console.error('Error deleting laporan:', error);

      res.status(500).json({
        success: false,
        message: 'Gagal menghapus laporan'
      });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
