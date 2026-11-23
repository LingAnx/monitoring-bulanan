// ============================================================
// routes/files.js — Download file terautentikasi
//
// GET /api/files/:id
//   - Autentikasi wajib
//   - Akses per-role: PEGAWAI (miliknya), ADMIN_SEKSI (seksi sama),
//     KEPALA_KANTOR (semua), SUPERADMIN (semua)
//   - Streaming dari private Object Storage
//   - Header keamanan: nosniff, attachment, no-store
// ============================================================
const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const { getObjectStorage } = require('../lib/object-storage');
const {
  canAccessFile,
} = require('../middleware/file-security');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/files/:id — download terautentikasi
router.get('/:id', authenticateToken, async (req, res) => {
  const fileId = req.params.id;

  // Validasi format
  if (!UUID_RE.test(fileId)) {
    return res.status(400).json({ success: false, message: 'ID file tidak valid' });
  }

  try {
    // Ambil metadata
    const fileRes = await pool.query(
      `SELECT id, owner_user_id, report_id, original_name, stored_name,
              detected_mime_type, size_bytes, sha256, storage_key, deleted_at
       FROM files
       WHERE id = $1`,
      [fileId]
    );

    if (fileRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'File tidak ditemukan' });
    }

    const file = fileRes.rows[0];

    // File sudah dihapus
    if (file.deleted_at) {
      return res.status(404).json({ success: false, message: 'File tidak ditemukan' });
    }

    // Cek akses per-role
    const allowed = await canAccessFile(req.user, file);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke file ini' });
    }

    // Streaming download dari private Object Storage setelah RBAC lolos.
    const storedObject = await getObjectStorage().getObjectStream(file.storage_key);
    const stream = storedObject.stream;
    const mime = file.detected_mime_type || storedObject.contentType;

    // Sanitasi nama download — hapus karakter berbahaya
    const safeName = file.original_name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

    res.setHeader('Content-Type', mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', file.size_bytes);

    // Audit log — download tetap berlanjut bila audit gagal,
    // tetapi kegagalan TIDAK di-swallow sunyi (observability).
    // Log hanya: request ID, user ID, file ID, aksi, pesan
    // error yang sudah disanitasi. TANPA token, path, isi file.
    pool.query(
      `INSERT INTO audit_trail (id_user, action, detail)
       VALUES ($1, 'download_file', $2)`,
      [
        req.user.id,
        JSON.stringify({ file_id: fileId, original_name: file.original_name, size_bytes: file.size_bytes }),
      ]
    ).catch((err) => {
      logger.error('Audit log download gagal — download tetap dilanjutkan', {
        requestId: req.requestId,
        userId: req.user.id,
        fileId,
        action: 'download_file',
        error: (err && err.message) ? String(err.message).slice(0, 200) : 'unknown',
      });
    });

    stream.on('error', (err) => {
      logger.error('[files] stream error', { error: err.message });
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Gagal membaca file' });
      } else {
        res.destroy();
      }
    });

    stream.pipe(res);

  } catch (err) {
    // Jangan bocorkan path filesystem
    if (err.status === 404) {
      return res.status(404).json({ success: false, message: 'File tidak ditemukan' });
    }
    if (err.status === 400) {
      return res.status(400).json({ success: false, message: err.message });
    }
    logger.error('[files] error', { error: err.message });
    res.status(err.status === 503 ? 503 : 500).json({ success: false, message: 'Gagal memproses download' });
  }
});

// GET /api/files/:id/metadata — metadata tanpa isi file (untuk UI)
// Access policy: owner_user_id + report_id dipakai untuk cek akses
// per-role. Internal fields (sha256, storage_key, stored_name,
// owner_user_id) tidak dikembalikan ke klien — cukup data yang
// dibutuhkan UI (nama, tipe, ukuran, URL download).
router.get('/:id/metadata', authenticateToken, async (req, res) => {
  const fileId = req.params.id;
  if (!UUID_RE.test(fileId)) {
    return res.status(400).json({ success: false, message: 'ID file tidak valid' });
  }

  try {
    // Ambil field lengkap yang dibutuhkan canAccessFile
    const fileRes = await pool.query(
      `SELECT id, owner_user_id, report_id, original_name,
              detected_mime_type, size_bytes, created_at, deleted_at
       FROM files WHERE id = $1`,
      [fileId]
    );
    if (fileRes.rows.length === 0 || fileRes.rows[0].deleted_at) {
      return res.status(404).json({ success: false, message: 'File tidak ditemukan' });
    }
    const file = fileRes.rows[0];
    const allowed = await canAccessFile(req.user, file);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke file ini' });
    }

    res.json({
      success: true,
      data: {
        id: file.id,
        originalName: file.original_name,
        mimeType: file.detected_mime_type,
        size: file.size_bytes,
        createdAt: file.created_at,
        downloadUrl: `/api/files/${file.id}`,
      },
    });
  } catch (err) {
    logger.error('[files metadata] error', { error: err.message });
    res.status(500).json({ success: false, message: 'Gagal mengambil metadata' });
  }
});

module.exports = router;
