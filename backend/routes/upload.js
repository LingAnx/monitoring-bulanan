// ============================================================
// routes/upload.js — Upload lampiran laporan
//
// Perubahan Tahap 4:
//   - Validasi tipe berdasarkan magic bytes (bukan ekstensi/MIME klien)
//   - Nama file penyimpanan dibuat server (UUID)
//   - Metadata tersimpan di tabel `files`
//   - Tidak lagi mengembalikan URL /uploads/<nama>
//   - Mengembalikan id UUID untuk endpoint download
//   - File sementara dihapus jika validasi/metadata gagal
// ============================================================
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const {
  STORAGE_ROOT,
  ALLOWED_MIME,
  analyzeFile,
  sanitizeDisplayName,
  makeStoredName,
  storageKey,
  removeFileSafely,
  parseZipEntries,
} = require('../middleware/file-security');

// ── Konfigurasi multer ────────────────────────────────────
// destination sementara — file dipindah setelah validasi
const TEMP_DIR = path.join(STORAGE_ROOT, '_tmp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMP_DIR),
    filename: (req, file, cb) => {
      // Nama unik sementara — belum final
      cb(null, 'tmp_' + crypto.randomUUID());
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB — server-side, bukan dari frontend
  },
  // Filter awal berdasarkan ekstensi — LINGKUNG PERTAHAN PERTAMA.
  // Validasi sesungguhnya (magic bytes) dilakukan setelah file ditulis.
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx']);
    if (!allowedExt.has(ext)) {
      const err = new Error(
        'Tipe file tidak didukung. Gunakan: PDF, JPG, PNG, DOCX, XLSX'
      );
      err.status = 415;
      return cb(err);
    }
    cb(null, true);
  },
});

// ── POST /api/upload ──────────────────────────────────────
// Upload lampiran. Wajib autentikasi.
// Body: multipart/form-data, field "file"
// Query: report_id (opsional — ID laporan terkait)
router.post('/', authenticateToken, upload.single('file'), async (req, res) => {
  let tempPath = null;
  try {
    // ── Validasi dasar ──
    if (!req.file) {
      // Cek apakah ada error multer (fileFilter reject, dll.)
      if (req.fileError) {
        return res.status(req.fileError.status || 415).json({
          success: false, message: req.fileError.message
        });
      }
      return res.status(400).json({ success: false, message: 'File tidak ditemukan' });
    }

    tempPath = req.file.path;
    const user = req.user;
    const reportId = req.query.report_id ? parseInt(req.query.report_id, 10) : null;

    // Jika report_id diberikan, validasi kepemilikan
    if (reportId) {
      const repCheck = await pool.query(
        `SELECT id FROM laporan WHERE id = $1 AND id_user = $2`,
        [reportId, user.id]
      );
      if (repCheck.rows.length === 0) {
        removeFileSafely(tempPath);
        return res.status(403).json({
          success: false,
          message: 'Tidak dapat mengunggah lampiran untuk laporan ini'
        });
      }
    }

    // ── Validasi tipe berdasarkan magic bytes ──
    const analysis = await analyzeFile(tempPath);

    if (analysis.forbidden) {
      removeFileSafely(tempPath);
      return res.status(415).json({
        success: false,
        message: 'Tipe file tidak diizinkan: ' + analysis.reason
      });
    }

    if (!analysis.mime || !ALLOWED_MIME.has(analysis.mime)) {
      removeFileSafely(tempPath);
      return res.status(415).json({
        success: false,
        message: 'Tipe file tidak dikenali atau tidak didukung'
      });
    }

    // ── Validasi struktur OOXML (DOCX/XLSX) ──
    // Cek arsip ZIP: entry valid, [Content_Types].xml ada,
    // word/document.xml (docx) atau xl/workbook.xml (xlsx) ada,
    // tidak ada path traversal, tidak ada zip bomb.
    const zipCheck = parseZipEntries(tempPath, analysis.mime);
    if (!zipCheck.ok) {
      removeFileSafely(tempPath);
      return res.status(415).json({
        success: false,
        message: zipCheck.reason || 'Struktur file tidak valid'
      });
    }

    // ── Simpan file ke lokasi final ──
    const display = sanitizeDisplayName(req.file.originalname);
    const storedName = makeStoredName(analysis.mime);
    const sKey = storageKey(storedName);
    const finalDir = path.join(STORAGE_ROOT, path.dirname(sKey));
    if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });
    const finalPath = path.join(STORAGE_ROOT, sKey);

    // Pindahkan dari temp ke final
    fs.renameSync(tempPath, finalPath);
    tempPath = null; // sudah dipindah — jangan hapus dua kali

    // ── Simpan metadata ──
    const insRes = await pool.query(
      `INSERT INTO files
         (owner_user_id, report_id, original_name, stored_name,
          detected_mime_type, size_bytes, sha256, storage_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        user.id,
        reportId || null,
        display,
        storedName,
        analysis.mime,
        analysis.size,
        analysis.sha256,
        sKey,
      ]
    );

    if (insRes.rows.length === 0) {
      removeFileSafely(sKey);
      return res.status(500).json({
        success: false,
        message: 'Gagal menyimpan metadata file'
      });
    }

    const fileId = insRes.rows[0].id;

    res.json({
      success: true,
      data: {
        id: fileId,
        originalName: display,
        mimeType: analysis.mime,
        size: analysis.size,
        // URL download — pakai endpoint API, bukan path filesystem
        downloadUrl: `/api/files/${fileId}`,
      },
    });

  } catch (err) {
    if (tempPath) removeFileSafely(tempPath);
    // Multer fileFilter error (ekstensi ditolak)
    if (err.status && [415, 400].includes(err.status)) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    const status = err.status || 500;
    if (err.status === 415) {
      return res.status(415).json({ success: false, message: err.message });
    }
    console.error('[upload]', err.message);
    res.status(status).json({ success: false, message: 'Gagal memproses file' });
  }
});

// ── DELETE /api/upload/:fileId ───────────────────────────
// Hapus lampiran (soft delete di metadata + hapus file fisik)
// Hanya pemilik file atau SUPERADMIN yang boleh menghapus.
router.delete('/:fileId', authenticateToken, async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const user = req.user;

    // Validasi UUID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId)) {
      return res.status(400).json({ success: false, message: 'ID file tidak valid' });
    }

    const fileRes = await pool.query(
      `SELECT * FROM files WHERE id = $1 AND deleted_at IS NULL`,
      [fileId]
    );
    if (fileRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'File tidak ditemukan' });
    }

    const file = fileRes.rows[0];

    // Hak hapus: pemilik atau superadmin
    if (file.owner_user_id !== user.id && user.role !== 'SUPERADMIN') {
      return res.status(403).json({ success: false, message: 'Anda tidak berhak menghapus file ini' });
    }

    // Soft delete metadata
    await pool.query(
      `UPDATE files SET deleted_at = NOW() WHERE id = $1`,
      [fileId]
    );

    // Hapus file fisik
    removeFileSafely(file.storage_key);

    res.json({ success: true, message: 'File dihapus' });
  } catch (err) {
    console.error('[upload delete]', err.message);
    res.status(500).json({ success: false, message: 'Gagal menghapus file' });
  }
});

module.exports = router;
