// ============================================================
// routes/files.js — Download file terautentikasi
//
// GET /api/files/:id
//   - Autentikasi wajib
//   - Akses per-role: PEGAWAI (miliknya), ADMIN_SEKSI (seksi sama),
//     KEPALA_KANTOR (semua), SUPERADMIN (semua)
//   - Streaming dari storage root
//   - Header keamanan: nosniff, attachment, no-store
// ============================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const pool = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  canAccessFile,
  streamFile,
  isWithinStorageRoot,
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

    // Streaming download
    const { stream, mime } = streamFile(file.storage_key, file.detected_mime_type, file.original_name);

    // Sanitasi nama download — hapus karakter berbahaya
    const safeName = file.original_name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

    res.setHeader('Content-Type', mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', file.size_bytes);

    // Audit log — tanpa token, tanpa isi file
    pool.query(
      `INSERT INTO audit_trail (id_user, action, details)
       VALUES ($1, 'download_file', $2)`,
      [
        req.user.id,
        JSON.stringify({ file_id: fileId, original_name: file.original_name, size_bytes: file.size_bytes }),
      ]
    ).catch(() => { /* audit log tidak boleh gagal download */ });

    stream.on('error', (err) => {
      console.error('[files] stream error:', err.message);
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
    console.error('[files]', err.message);
    res.status(500).json({ success: false, message: 'Gagal memproses download' });
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
    console.error('[files metadata]', err.message);
    res.status(500).json({ success: false, message: 'Gagal mengambil metadata' });
  }
});

module.exports = router;
