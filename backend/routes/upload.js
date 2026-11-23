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
const { logger } = require('../middleware/logger');
const {
  getObjectStorage,
  uploadWithCompensation,
} = require('../lib/object-storage');
const {
  STORAGE_ROOT,
  ALLOWED_MIME,
  analyzeFile,
  sanitizeDisplayName,
  makeStoredName,
  storageKey,
  removeAbsoluteFileSafely,
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
  // Kebijakan: hanya role PEGAWAI yang boleh mengunggah lampiran.
  if (req.user.role !== 'PEGAWAI') {
    // Hapus file temp yang sudah ditulis multer (absolute path)
    if (req.file) { removeAbsoluteFileSafely(req.file.path); req.file = null; }
    return res.status(403).json({ success: false, message: 'Hanya Pegawai yang dapat mengunggah lampiran' });
  }
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

    // ── Validasi report_id ──────────────────────────────────────
    // Menerima integer positif murni:
    //   valid: "1", 1, "1" (string dari query)
    //   tolak: "1abc", "0", "-1", "1.5", [], "", " ", null
    //         number > MAX_SAFE_INTEGER
    const rawReportId = req.query.report_id;
    let reportId = null;
    if (rawReportId !== undefined && rawReportId !== null && rawReportId !== '') {
      const s = String(rawReportId).trim();
      // Pola ketat: hanya digit, minimal satu karakter, tanpa tanda
      if (!/^[0-9]+$/.test(s)) {
        removeAbsoluteFileSafely(tempPath);
        tempPath = null;
        return res.status(400).json({
          success: false,
          message: 'report_id harus integer positif (contoh: 1, 2, 3)'
        });
      }
      const n = Number(s);
      if (!Number.isInteger(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER) {
        removeAbsoluteFileSafely(tempPath);
        tempPath = null;
        return res.status(400).json({
          success: false,
          message: 'report_id di luar rentang valid'
        });
      }
      reportId = n;

      // Validasi kepemilikan + status laporan
      const repCheck = await pool.query(
        `SELECT id, status FROM laporan WHERE id = $1 AND id_user = $2`,
        [reportId, user.id]
      );
      if (repCheck.rows.length === 0) {
        removeAbsoluteFileSafely(tempPath);
        tempPath = null;
        return res.status(403).json({
          success: false,
          message: 'Tidak dapat mengunggah lampiran untuk laporan ini'
        });
      }
      // Hanya status yang masih editable
      const editableStatuses = ['draft', 'revisi_admin', 'revisi_kantor'];
      if (!editableStatuses.includes(repCheck.rows[0].status)) {
        removeAbsoluteFileSafely(tempPath);
        tempPath = null;
        return res.status(403).json({
          success: false,
          message: 'Laporan sudah dikunci — lampiran tidak dapat diubah'
        });
      }
    }

    // ── Validasi tipe berdasarkan magic bytes ──
    const analysis = await analyzeFile(tempPath);

    if (analysis.forbidden) {
      removeAbsoluteFileSafely(tempPath);
      return res.status(415).json({
        success: false,
        message: 'Tipe file tidak diizinkan: ' + analysis.reason
      });
    }

    if (!analysis.mime || !ALLOWED_MIME.has(analysis.mime)) {
      removeAbsoluteFileSafely(tempPath);
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
      removeAbsoluteFileSafely(tempPath);
      return res.status(415).json({
        success: false,
        message: zipCheck.reason || 'Struktur file tidak valid'
      });
    }

    // ── Simpan file ke private Object Storage ──
    const display = sanitizeDisplayName(req.file.originalname);
    const storedName = makeStoredName(analysis.mime);
    const sKey = storageKey(storedName);
    const objectStorage = getObjectStorage();
    const insRes = await uploadWithCompensation({
      storage: objectStorage,
      upload: {
        key: sKey,
        body: fs.createReadStream(tempPath, { highWaterMark: 64 * 1024 }),
        contentType: analysis.mime,
        contentLength: analysis.size,
      },
      persistMetadata: async () => {
        const result = await pool.query(
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
        if (result.rows.length === 0) {
          const error = new Error('Metadata file tidak menghasilkan ID');
          error.code = 'FILE_METADATA_ERROR';
          throw error;
        }
        return result;
      },
    });

    removeAbsoluteFileSafely(tempPath);
    tempPath = null;

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
    if (tempPath) removeAbsoluteFileSafely(tempPath);
    if (err.cleanupError) {
      logger.error('[upload] kompensasi object gagal', {
        error: err.cleanupError.message,
      });
    }
    // Multer fileFilter error (ekstensi ditolak)
    if (err.status && [415, 400].includes(err.status)) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    const status = err.status || 500;
    if (err.status === 415) {
      return res.status(415).json({ success: false, message: err.message });
    }
    logger.error('[upload] error', { error: err.message });
    res.status(status).json({ success: false, message: 'Gagal memproses file' });
  }
});

// ── DELETE /api/upload/:fileId ───────────────────────────
// Hapus lampiran (hapus object + soft delete metadata)
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

    // Hapus object lebih dulu. Jika provider gagal, metadata tetap aktif agar
    // operator dapat mencoba ulang dan tidak kehilangan referensi diam-diam.
    await getObjectStorage().deleteObject(file.storage_key);

    // Soft delete metadata setelah penghapusan object berhasil.
    await pool.query(
      `UPDATE files SET deleted_at = NOW() WHERE id = $1`,
      [fileId]
    );

    res.json({ success: true, message: 'File dihapus' });
  } catch (err) {
    logger.error('[upload delete] error', { error: err.message });
    res.status(err.status === 503 ? 503 : 500).json({ success: false, message: 'Gagal menghapus file' });
  }
});

module.exports = router;
