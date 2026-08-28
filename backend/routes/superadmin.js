const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const pool = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ── Security: Backup files stored in PRIVATE directory, NOT under express.static ──
const BACKUP_DIR = path.join(__dirname, '..', 'private', 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// ── Dashboard Stats ──────────────────────────────────────────────────────
router.get('/', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const now = new Date();
    const currentBulan = now.getMonth() + 1;
    const currentTahun = now.getFullYear();

    const [
      totalUsers, totalPegawai, totalAdminSeksi, totalKepalaKantor,
      totalSeksi, totalLaporanBulanBerjalan, totalLaporanDisetujui,
      laporanMenungguVerifikasi, laporanMenungguPersetujuan,
      laporanRevisiAdmin, laporanRevisiKantor,
      laporanPerSeksi, laporanPerBulanTahun, statusDistribution,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS cnt FROM users'),
      pool.query("SELECT COUNT(*) AS cnt FROM users WHERE role = 'PEGAWAI'"),
      pool.query("SELECT COUNT(*) AS cnt FROM users WHERE role = 'ADMIN_SEKSI'"),
      pool.query("SELECT COUNT(*) AS cnt FROM users WHERE role = 'KEPALA_KANTOR'"),
      pool.query('SELECT COUNT(*) AS cnt FROM seksi'),
      pool.query('SELECT COUNT(*) AS cnt FROM laporan WHERE bulan = $1 AND tahun = $2', [currentBulan, currentTahun]),
      pool.query("SELECT COUNT(*) AS cnt FROM laporan WHERE status = 'disetujui'"),
      pool.query("SELECT COUNT(*) AS cnt FROM laporan WHERE status = 'diajukan'"),
      pool.query("SELECT COUNT(*) AS cnt FROM laporan WHERE status = 'diteruskan'"),
      pool.query("SELECT COUNT(*) AS cnt FROM laporan WHERE status = 'revisi_admin'"),
      pool.query("SELECT COUNT(*) AS cnt FROM laporan WHERE status = 'revisi_kantor'"),
      pool.query(`
        SELECT s.nama_seksi, COUNT(l.id) AS jumlah
        FROM laporan l
        JOIN users u ON l.id_user = u.id
        JOIN seksi s ON u.id_seksi = s.id
        GROUP BY s.nama_seksi ORDER BY jumlah DESC
      `),
      pool.query(`
        SELECT bulan, tahun, COUNT(*) AS jumlah
        FROM laporan
        GROUP BY bulan, tahun
        ORDER BY tahun DESC, bulan DESC
        LIMIT 12
      `),
      pool.query(`
        SELECT status, COUNT(*) AS jumlah
        FROM laporan GROUP BY status ORDER BY jumlah DESC
      `),
    ]);

    // Pegawai belum lapor
    const belumLapor = await pool.query(
      `SELECT COUNT(*) AS cnt FROM users u
       WHERE u.role = 'PEGAWAI' AND u.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM laporan l
         WHERE l.id_user = u.id AND l.bulan = $1 AND l.tahun = $2
       )`,
      [currentBulan, currentTahun]
    );

    res.json({
      success: true,
      data: {
        users: {
          total_users: parseInt(totalUsers.rows[0].cnt),
          total_pegawai: parseInt(totalPegawai.rows[0].cnt),
          total_admin_seksi: parseInt(totalAdminSeksi.rows[0].cnt),
          total_kepala_kantor: parseInt(totalKepalaKantor.rows[0].cnt),
        },
        seksi: { total_seksi: parseInt(totalSeksi.rows[0].cnt) },
        laporan: {
          total_bulan_berjalan: parseInt(totalLaporanBulanBerjalan.rows[0].cnt),
          total_disetujui: parseInt(totalLaporanDisetujui.rows[0].cnt),
          menunggu_verifikasi: parseInt(laporanMenungguVerifikasi.rows[0].cnt),
          menunggu_persetujuan: parseInt(laporanMenungguPersetujuan.rows[0].cnt),
          perlu_revisi: parseInt(laporanRevisiAdmin.rows[0].cnt) + parseInt(laporanRevisiKantor.rows[0].cnt),
          pegawai_belum_lapor: parseInt(belumLapor.rows[0].cnt),
          per_seksi: laporanPerSeksi.rows,
          per_bulan_tahun: laporanPerBulanTahun.rows,
          status_distribution: statusDistribution.rows,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat statistik dashboard' });
  }
});

// ── Audit Trail ──────────────────────────────────────────────────────────
router.get('/audit-trail', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { bulan, tahun, user_id, action, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const whereClauses = [];
    const params = [];

    if (bulan && tahun) {
      whereClauses.push(
        `EXTRACT(MONTH FROM at.created_at) = $${params.length + 1} AND EXTRACT(YEAR FROM at.created_at) = $${params.length + 2}`
      );
      params.push(parseInt(bulan), parseInt(tahun));
    }
    if (user_id) {
      whereClauses.push(`at.id_user = $${params.length + 1}`);
      params.push(user_id);
    }
    if (action) {
      whereClauses.push(`at.action ILIKE $${params.length + 1}`);
      params.push(`%${action}%`);
    }
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*) AS cnt FROM audit_trail at ${whereSql}`, params);
    const total = parseInt(countResult.rows[0].cnt);

    const result = await pool.query(
      `SELECT at.id, at.id_laporan, at.id_user, u.nama AS user_name, u.role AS user_role,
              at.action, at.detail, at.created_at
       FROM audit_trail at
       LEFT JOIN users u ON at.id_user = u.id
       ${whereSql}
       ORDER BY at.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    res.json({ success: true, data: result.rows, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (error) {
    console.error('Error fetching audit trail:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat audit trail' });
  }
});

// ── Monitoring ───────────────────────────────────────────────────────────
router.get('/monitoring', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { bulan, tahun } = req.query;
    const targetBulan = bulan ? parseInt(bulan) : new Date().getMonth() + 1;
    const targetTahun = tahun ? parseInt(tahun) : new Date().getFullYear();

    const sections = await pool.query('SELECT id, nama_seksi FROM seksi ORDER BY id');
    const allPegawai = await pool.query(
      `SELECT u.id, u.nama, u.nip, u.username, u.id_seksi
       FROM users u WHERE u.role = 'PEGAWAI' AND u.is_active = true ORDER BY u.nama`
    );

    const submittedIds = await pool.query(
      `
      SELECT DISTINCT id_user
      FROM laporan
      WHERE bulan = $1
        AND tahun = $2
        AND status IN (
          'diajukan',
          'diteruskan',
          'revisi_admin',
          'revisi_kantor',
          'disetujui'
        )
      `,
      [targetBulan, targetTahun]
    ); 
    const submittedSet = new Set(submittedIds.rows.map((r) => r.id_user));

    const sectionsSummary = await Promise.all(sections.rows.map(async (sek) => {
      const peg = allPegawai.rows.filter((p) => p.id_seksi === sek.id);
      const sudah = peg.filter((p) => submittedSet.has(p.id));
      const belum = peg.filter((p) => !submittedSet.has(p.id));
      return {
        id_seksi: sek.id, nama_seksi: sek.nama_seksi,
        total_pegawai: peg.length, sudah_lapor: sudah.length, belum_lapor: belum.length,
        sudah: sudah.map((p) => ({ id: p.id, nama: p.nama, nip: p.nip })),
        belum: belum.map((p) => ({ id: p.id, nama: p.nama, nip: p.nip })),
      };
    }));

    const complianceRate = allPegawai.rows.length > 0
      ? Math.round((submittedSet.size / allPegawai.rows.length) * 100)
      : 0;

    res.json({
      success: true,
      data: { bulan: targetBulan, tahun: targetTahun, sections: sectionsSummary, compliance_rate: complianceRate },
    });
  } catch (error) {
    console.error('Error fetching monitoring data:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat data monitoring' });
  }
});

// ── Period Management ────────────────────────────────────────────────────
router.get('/periode', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM periode_laporan ORDER BY tahun DESC, bulan DESC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching periods:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat periode' });
  }
});

router.post('/periode', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { bulan, tahun, tanggal_mulai, deadline, status = 'aktif' } = req.body;
    if (bulan == null || tahun == null || !tanggal_mulai || !deadline) {
      return res.status(400).json({ success: false, message: 'bulan, tahun, tanggal_mulai, dan deadline wajib diisi' });
    }
    const result = await pool.query(
      `INSERT INTO periode_laporan (bulan, tahun, tanggal_mulai, deadline, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [parseInt(bulan), parseInt(tahun), tanggal_mulai, deadline, status]
    );
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'periode.create', `Membuat periode: ${result.rows[0].bulan}/${result.rows[0].tahun}`]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating period:', error);
    res.status(500).json({ success: false, message: 'Gagal membuat periode' });
  }
});

router.put('/periode/:id', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { bulan, tahun, tanggal_mulai, deadline, status } = req.body;
    const updates = []; const params = []; let idx = 1;
    if (bulan != null) { updates.push(`bulan=$${idx++}`); params.push(parseInt(bulan)); }
    if (tahun != null) { updates.push(`tahun=$${idx++}`); params.push(parseInt(tahun)); }
    if (tanggal_mulai) { updates.push(`tanggal_mulai=$${idx++}`); params.push(tanggal_mulai); }
    if (deadline) { updates.push(`deadline=$${idx++}`); params.push(deadline); }
    if (status) { updates.push(`status=$${idx++}`); params.push(status); }
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada field yang diubah' });
    }
    params.push(id);
    const result = await pool.query(`UPDATE periode_laporan SET ${updates.join(', ')} WHERE id=$${idx} RETURNING *`, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Periode tidak ditemukan' });
    }
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'periode.update', `Memperbarui periode ID ${id}: status=${result.rows[0].status}`]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating period:', error);
    res.status(500).json({ success: false, message: 'Gagal memperbarui periode' });
  }
});

router.delete('/periode/:id', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM periode_laporan WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Periode tidak ditemukan' });
    }
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'periode.delete', `Menghapus periode ID ${id}`]
    );
    res.json({ success: true, message: 'Periode dihapus' });
  } catch (error) {
    console.error('Error deleting period:', error);
    res.status(500).json({ success: false, message: 'Gagal menghapus periode' });
  }
});

router.post('/periode/:id/close', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("UPDATE periode_laporan SET status='ditutup' WHERE id=$1 RETURNING *", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Periode tidak ditemukan' });
    }
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'periode.close', `Menutup periode ID ${id}`]
    );
    res.json({ success: true, data: result.rows[0], message: 'Periode berhasil ditutup' });
  } catch (error) {
    console.error('Error closing period:', error);
    res.status(500).json({ success: false, message: 'Gagal menutup periode' });
  }
});

router.post('/periode/:id/open', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("UPDATE periode_laporan SET status='aktif' WHERE id=$1 RETURNING *", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Periode tidak ditemukan' });
    }
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'periode.open', `Membuka periode ID ${id}`]
    );
    res.json({ success: true, data: result.rows[0], message: 'Periode berhasil dibuka' });
  } catch (error) {
    console.error('Error opening period:', error);
    res.status(500).json({ success: false, message: 'Gagal membuka periode' });
  }
});

// ── Settings ─────────────────────────────────────────────────────────────
router.get('/settings', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value, update_at FROM settings  ORDER BY key');
    const settings = {};
    result.rows.forEach((row) => {
      let val = row.value;
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (!isNaN(Number(val)) && val.trim() !== '') val = Number(val);
      settings[row.key] = { value: val, description, updated_at: row.updated_at };
    });
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat pengaturan (table settings mungkin belum dibuat)' });
  }
});

router.put(
  '/settings',
  authenticateToken,
  requireRole('SUPERADMIN'),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const updates = req.body;
      const entries = Object.entries(updates);

      if (entries.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Tidak ada setting untuk diperbarui'
        });
      }

      await client.query('BEGIN');

      for (const [key, value] of entries) {
        await client.query(
          `
          UPDATE settings
          SET value = $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE key = $2
          `,
          [String(value), key]
        );
      }

      await client.query(
        `
        INSERT INTO audit_trail
          (id_user, action, detail)
        VALUES ($1, $2, $3)
        `,
        [
          req.user.id,
          'settings.update',
          `Memperbarui ${entries.length} pengaturan`
        ]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Pengaturan berhasil diperbarui'
      });

    } catch (error) {
      await client.query('ROLLBACK');

      console.error('Error updating settings:', error);

      res.status(500).json({
        success: false,
        message: 'Gagal memperbarui pengaturan'
      });

    } finally {
      client.release();
    }
  }
);

// ── Export JSON ──────────────────────────────────────────────────────────
router.get('/export/users', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.nama, u.nip, u.role, u.is_active,
             s.nama_seksi, u.created_at
      FROM users u LEFT JOIN seksi s ON u.id_seksi = s.id ORDER BY u.id`
    );
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'export.users', 'Mengekspor data pengguna']
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error exporting users:', error);
    res.status(500).json({ success: false, message: 'Gagal mengekspor pengguna' });
  }
});

router.get('/export/reports', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { bulan, tahun } = req.query;
    let sql = `SELECT l.id, l.judul, l.bulan, l.tahun, l.status, l.catatan_admin,
                      l.tanggal_pengajuan, u.nama AS nama_pegawai, u.nip, s.nama_seksi
               FROM laporan l
               JOIN users u ON l.id_user = u.id
               LEFT JOIN seksi s ON u.id_seksi = s.id`;
    const params = [];
    if (bulan && tahun) { sql += ` WHERE l.bulan = $1 AND l.tahun = $2`; params.push(parseInt(bulan), parseInt(tahun)); }
    sql += ' ORDER BY l.id DESC';
    const result = await pool.query(sql, params);
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'export.reports', `Mengekspor laporan${bulan ? ' bulan ' + bulan : ''}${tahun ? ' tahun ' + tahun : ''}`]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error exporting reports:', error);
    res.status(500).json({ success: false, message: 'Gagal mengekspor laporan' });
  }
});

// ── Backup (PRIVATE directory — not exposed via express.static) ─────────
router.post('/backup', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const tables = ['users', 'laporan', 'seksi', 'verifikasi', 'persetujuan', 'audit_trail', 'notifications', 'periode_laporan', 'settings'];
    const backup = {};
    for (const table of tables) {
      try {
        const result = await pool.query(`SELECT * FROM ${table}`);
        backup[table] = result.rows;
      } catch (err) {
        backup[table] = { error: `Table not found: ${err.message}` };
      }
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'backup.create', `Membuat backup: ${filename}`]
    );
    res.json({ success: true, message: 'Backup berhasil dibuat', data: { filename, size: fs.statSync(filepath).size } });
  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(500).json({ success: false, message: 'Gagal membuat backup' });
  }
});

router.get('/backup/list', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json')).sort().reverse();
    const list = files.map((f) => ({
      filename: f,
      size: fs.statSync(path.join(BACKUP_DIR, f)).size,
      created_at: fs.statSync(path.join(BACKUP_DIR, f)).mtime.toISOString(),
    }));
    res.json({ success: true, data: list });
  } catch (error) {
    console.error('Error listing backups:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat daftar backup' });
  }
});

router.get('/backup/download/:filename', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { filename } = req.params;
    // Security: reject path traversal
    const safeName = path.basename(filename);
    if (safeName !== filename) {
      return res.status(400).json({ success: false, message: 'Nama file tidak valid' });
    }
    const filepath = path.join(BACKUP_DIR, safeName);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, message: 'File backup tidak ditemukan' });
    }
    await pool.query(
      'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
      [req.user.id, 'backup.download', `Mengunduh backup: ${safeName}`]
    );
    res.download(filepath, safeName);
  } catch (error) {
    console.error('Error downloading backup:', error);
    res.status(500).json({ success: false, message: 'Gagal mengunduh backup' });
  }
});

// ── Notifications / Broadcast ────────────────────────────────────────────
router.post('/notifications/send', authenticateToken, requireRole('SUPERADMIN'), async (req, res) => {
  try {
    const { id_user, title, message, type = 'info' } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title dan message wajib diisi' });
    }
    if (id_user) {
      const target = await pool.query('SELECT id, nama FROM users WHERE id = $1 AND is_active = true', [id_user]);
      if (target.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Pengguna target tidak ditemukan atau nonaktif' });
      }
      const result = await pool.query(
        'INSERT INTO notifications (id_user, title, message, type) VALUES ($1, $2, $3, $4) RETURNING *',
        [id_user, title, message, type]
      );
      await pool.query(
        'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
        [req.user.id, 'notification.send', `Mengirim notifikasi ke ${target.rows[0].nama}: ${title}`]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } else {
      const result = await pool.query('SELECT id, nama FROM users WHERE is_active = true');
      if (result.rows.length === 0) {
        return res.json({ success: true, message: 'Tidak ada pengguna aktif untuk diberi notifikasi' });
      }
      await Promise.all(
        result.rows.map((u) =>
          pool.query('INSERT INTO notifications (id_user, title, message, type) VALUES ($1, $2, $3, $4)', [u.id, title, message, type])
        )
      );
      await pool.query(
        'INSERT INTO audit_trail (id_user, action, detail) VALUES ($1, $2, $3)',
        [req.user.id, 'notification.broadcast', `Broadcast notifikasi ke ${result.rows.length} pengguna: ${title}`]
      );
      res.json({ success: true, message: `Notifikasi dikirim ke ${result.rows.length} pengguna` });
    }
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ success: false, message: 'Gagal mengirim notifikasi' });
  }
});

module.exports = router;
