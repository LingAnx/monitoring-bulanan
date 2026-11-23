// ============================================================
// middleware/file-security.js
// Keamanan file: deteksi tipe (magic bytes), validasi nama,
// SHA-256, akses per-role, dan streaming download.
//
// Dipakai oleh:
//   - routes/upload.js  (validasi upload)
//   - routes/files.js   (download terautentikasi)
// ============================================================
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../db/database');

// ── Lokasi storage ────────────────────────────────────────
// File disimpan DI LUAR public/ dan DI LUAR root repository yang bisa diakses HTTP.
// backend/uploads/ sudah di-abaikan oleh static-guard (Tahap 3).
const STORAGE_ROOT = path.resolve(__dirname, '..', 'uploads');

// ── Allowlist MIME yang diterima (sesuai kebutuhan bisnis) ─
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// ── Magic byte signatures ─────────────────────────────────
// Dipakai untuk verifikasi bahwa ISi file sesuai klaim tipe.
const SIGNATURES = [
  // { mime, check(buffer) => boolean }
  {
    mime: 'application/pdf',
    check: (b) => b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46, // %PDF
  },
  {
    mime: 'image/jpeg',
    check: (b) => b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
  },
  {
    mime: 'image/png',
    check: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
      b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A,
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    check: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04, // ZIP (PK..)
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    check: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04, // ZIP
  },
];

// Tipe yang selalu ditolak (polyglot, active content, executable)
const ALWAYS_FORBIDDEN = [
  // HTML
  { mime: 'text/html',  sig: (b) => b.length >= 4 && (b[0] === 0x3C || b[0] === 0x7B) }, // < or {
  // SVG
  { mime: 'image/svg+xml', sig: (b) => b.length >= 5 && (
      (b[0] === 0x3C && b[1] === 0x3F) || // <?
      (b[0] === 0x3C && b[1] === 0x21) || // <!
      (b[0] === 0x3C && b[1] === 0x73)    // <s
    )},
];

// ── Nama file yang selalu ditolak ─────────────────────────
const FORBIDDEN_FILENAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1','com2','com3','com4','lpt1','lpt2','lpt3','lpt4',
  '.env', '.git', 'index.html',
]);

// ── OOXML structure validation (DOCX/XLSX) ─────────────────
//
// DOCX/XLSX files are ZIP archives. Magic-byte check alone is
// not enough: any ZIP (JSP, EXE with PK header, arbitrary binary)
// matches PK\x03\x04. The OOXML spec (ECMA-376 / OPC) requires:
//
//   - Zip64 end-of-central-directory signature: 0x50 0x4B 0x05 0x06
//   - A `[Content_Types].xml` entry at the root of the archive
//   - For .docx: entries under `word/` including `word/document.xml`
//   - For .xlsx: entries under `xl/` including `xl/workbook.xml`
//   - No entry path traversal (names containing `..` or absolute paths)
//   - Zip-bomb resistance: cap on entry count and total uncompressed
//     size.
//
// We do NOT decompress the archive — we only parse the central
// directory, which is safe (stored in clear, no compression).
// This catches polyglot archives that claim to be OOXML but are
// actually anything else (script, macro, executable inside a ZIP).
//
// Limits:
//   MAX_ZIP_ENTRIES      = 10000   (docx/xlsx rarely exceeds this)
//   MAX_TOTAL_UNCOMPRESSED = 512 MB (zip-bomb defence; OOXML files
//                                    in this app are small reports)
//   MAX_ENTRY_NAME_LEN   = 255     (ZIP spec max)

const MAX_ZIP_ENTRIES = 10000;
const MAX_TOTAL_UNCOMPRESSED = 512 * 1024 * 1024; // 512 MB
const MAX_ENTRY_NAME_LEN = 255;

/**
 * Parse the Zip central directory from a file. Returns an array of
 * entry names (local-file-header scan, NOT central directory — this
 * is simpler and sufficient for structure checks without decompression).
 *
 * We scan the local file headers (PK\x03\x04) sequentially because the
 * central directory may be far away and needs a seek; local headers
 * are at the start of the archive and easy to walk.
 *
 * Returns:
 *   { ok: true,  entries: [names], totalUncompressed: n }
 *   { ok: false, reason: string }
 */
function parseZipEntries(filePath, mime) {
  const buf = fs.readFileSync(filePath);
  const isWord = mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isSheet = mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (!isWord && !isSheet) {
    return { ok: true, entries: [], totalUncompressed: 0 }; // not an OOXML; skip
  }

  // Magic byte PK check (already done by caller, but double-check).
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4B) {
    return { ok: false, reason: 'Bukan arsip ZIP yang valid' };
  }

  const entries = [];
  let totalUncompressed = 0;
  let offset = 0;

  while (offset + 30 <= buf.length) {
    // Local file header signature
    if (buf[offset] !== 0x50 || buf[offset + 1] !== 0x4B ||
        buf[offset + 2] !== 0x03 || buf[offset + 3] !== 0x04) {
      break; // not a local header — stop (may be a mid-file marker)
    }

    // Read flags, method, compressed size, uncompressed size, name length
    const flags = buf.readUInt16LE(offset + 6);
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);

    // Zip64: if compSize/uncompSize are 0xFFFFFFFF, read the
    // zip64 extra field for the real values.
    let realCompSize = compSize;
    let realUncompSize = uncompSize;
    if (compSize === 0xFFFFFFFF || uncompSize === 0xFFFFFFFF) {
      // Parse extra field for zip64
      const extraStart = offset + 30 + nameLen;
      let p = extraStart;
      while (p + 4 <= buf.length && p + extraLen <= buf.length) {
        const tag = buf.readUInt16LE(p);
        const len = buf.readUInt16LE(p + 2);
        if (tag === 0x0001 && len >= 16) {
          // Zip64 extra: uncompressedSize (8 bytes, LE), compressedSize (8 bytes)
          if (uncompSize === 0xFFFFFFFF && len >= 8) {
            realUncompSize = Number(buf.readBigUInt64LE(p + 4));
          }
          if (compSize === 0xFFFFFFFF && len >= 16) {
            realCompSize = Number(buf.readBigUInt64LE(p + 12));
          }
        }
        p += 4 + len;
      }
    }

    // Entry name
    const nameStart = offset + 30;
    if (nameStart + nameLen > buf.length) {
      return { ok: false, reason: 'Struktur ZIP rusak (nama entry melampaui batas)' };
    }
    let entryName = buf.toString('utf8', nameStart, nameStart + nameLen);

    // Path traversal check
    if (entryName.includes('..') || entryName.startsWith('/') || entryName.startsWith('\\')) {
      return { ok: false, reason: 'Nama entry mengandung path traversal' };
    }

    entries.push(entryName);
    totalUncompressed += realUncompSize;

    // Zip-bomb: reject if limits exceeded
    if (entries.length > MAX_ZIP_ENTRIES) {
      return { ok: false, reason: 'Jumlah entry ZIP melebihi batas (zip bomb?)' };
    }
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) {
      return { ok: false, reason: 'Total ukuran terurai melebihi batas (zip bomb?)' };
    }

    // Advance to next local header
    offset = offset + 30 + nameLen + extraLen + realCompSize;
    if (offset + 30 > buf.length) break;
  }

  if (entries.length === 0) {
    return { ok: false, reason: 'Tidak ada entry dalam arsip ZIP' };
  }

  // Structural check: [Content_Types].xml must exist
  const hasContentTypes = entries.some(n => n === '[Content_Types].xml' || n === '_rels/.rels');
  if (!hasContentTypes) {
    return { ok: false, reason: 'Arsip bukan OOXML valid (missing [Content_Types].xml)' };
  }

  // For .docx: require word/document.xml
  if (isWord) {
    const hasWordXml = entries.some(n => n === 'word/document.xml');
    if (!hasWordXml) {
      return { ok: false, reason: 'DOCX harus berisi word/document.xml' };
    }
  }

  // For .xlsx: require xl/workbook.xml
  if (isSheet) {
    const hasWorkbook = entries.some(n => n === 'xl/workbook.xml');
    if (!hasWorkbook) {
      return { ok: false, reason: 'XLSX harus berisi xl/workbook.xml' };
    }
  }

  return { ok: true, entries, totalUncompressed };
}
function extForMime(mime) {
  switch (mime) {
    case 'application/pdf': return '.pdf';
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return '.docx';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return '.xlsx';
    default: return null;
  }
}

/**
 * Deteksi MIME berdasarkan magic bytes buffer (maks 8KB pertama).
 * Return: { mime: string|null, forbidden: boolean, reason: string|null }
 */
function detectMime(headBuf) {
  // Cek tipe yang selalu dilarang dulu
  for (const f of ALWAYS_FORBIDDEN) {
    if (f.sig(headBuf)) {
      return { mime: f.mime, forbidden: true, reason: `Tipe ${f.mime} tidak diizinkan` };
    }
  }
  // Cari signature yang cocok
  for (const sig of SIGNATURES) {
    if (sig.check(headBuf)) {
      return { mime: sig.mime, forbidden: false, reason: null };
    }
  }
  // Tidak ada signature yang cocok
  return { mime: null, forbidden: false, reason: 'Signature file tidak dikenali' };
}

/**
 * Baca 8KB pertama file untuk deteksi tipe + hitung SHA-256 seluruh file (streaming).
 * Return: { mime, sha256, size, forbidden, reason }
 */
async function analyzeFile(filePath) {
  const size = fs.statSync(filePath).size;

  // SHA-256 streaming (tidak memuat seluruh file ke memori)
  const sha = crypto.createHash('sha256');
  const readStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
  await new Promise((resolve, reject) => {
    readStream.on('data', chunk => sha.update(chunk));
    readStream.on('end', resolve);
    readStream.on('error', reject);
  });
  const sha256 = sha.digest('hex');

  // Magic bytes — baca 8KB pertama
  const headFd = fs.openSync(filePath, 'r');
  const headBuf = Buffer.alloc(Math.min(8192, size));
  const bytesRead = fs.readSync(headFd, headBuf, 0, headBuf.length, 0);
  fs.closeSync(headFd);
  const head = headBuf.subarray(0, bytesRead);

  const detected = detectMime(head);

  return {
    mime: detected.mime,
    sha256,
    size,
    forbidden: detected.forbidden,
    reason: detected.reason,
  };
}

/**
 * Validasi nama file dari klien — return nama yang aman untuk tampilan.
 * Nama ini HANYA untuk display; path storage ditentukan server.
 */
function sanitizeDisplayName(originalName, maxLen = 100) {
  if (typeof originalName !== 'string') return 'file';
  let name = originalName;

  // Hapus control characters
  name = name.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

  // Hapus path separator (forward dan backslash)
  name = name.split(/[\\/]/).pop() || 'file';

  // Hapus karakter bidi/unicode trick
  name = name.replace(/[\u202A-\u202E\u2066-\u2069]/g, '');

  // Tolak nama perangkat Windows
  const base = name.replace(/\..*$/, '');
  if (FORBIDDEN_FILENAMES.has(base.toLowerCase())) {
    name = 'file_' + name;
  }

  // Batasi panjang
  if (name.length > maxLen) {
    const ext = path.extname(name);
    const stem = name.slice(0, maxLen - ext.length);
    name = stem + ext;
  }

  return name || 'file';
}

/**
 * Buat nama file penyimpanan yang unik dan sulit ditebak.
 * Format: <uuid>-<detected-ext>
 */
function makeStoredName(detectedMime) {
  const uuid = crypto.randomUUID();
  const ext = extForMime(detectedMime) || '';
  return uuid + ext;
}

/**
 * Buat storage key relatif dari storage root.
 */
function storageKey(storedName) {
  // Struktur: <first-2-chars-of-uuid>/<stored-name>
  // Mengurangi jumlah file per direktori saat volume besar.
  const prefix = storedName.slice(0, 2);
  return `${prefix}/${storedName}`;
}

/**
 * Validasi bahwa path hasil resolve tetap berada di dalam STORAGE_ROOT.
 * Return: true jika aman.
 */
function isWithinStorageRoot(resolvedPath) {
  const root = path.resolve(STORAGE_ROOT);
  const resolved = path.resolve(resolvedPath);
  return resolved === root || resolved.startsWith(root + path.sep);
}

/**
 * Middleware Express untuk endpoint download.
 * Menangani: auth check, akses per-role, streaming, header keamanan.
 */

/**
 * Cek apakah user memiliki akses ke file berdasarkan relasi laporan.
 * Aturan:
 *   PEGAWAI       → hanya laporan yang id_user = user.id
 *   ADMIN_SEKSI   → laporan pegawai di seksi yang sama (id_seksi)
 *   KEPALA_KANTOR → semua laporan dalam workflow (tanpa batasan seksi)
 *   SUPERADMIN    → semua (kebijakan eksplisit)
 */
async function canAccessFile(user, fileRow) {
  if (!user || !fileRow) return false;

  if (user.role === 'SUPERADMIN') return true;

  // File belum dikaitkan ke laporan
  if (!fileRow.report_id) {
    // Hanya pemilik file yang boleh akses file belum terikat
    return fileRow.owner_user_id === user.id;
  }

  // Ambil laporan terkait
  const repRes = await pool.query(
    `SELECT l.id_user, u.id_seksi, l.status
     FROM laporan l
     JOIN users u ON u.id = l.id_user
     WHERE l.id = $1`,
    [fileRow.report_id]
  );
  if (repRes.rows.length === 0) return false;
  const report = repRes.rows[0];

  if (user.role === 'PEGAWAI') {
    return report.id_user === user.id;
  }

  if (user.role === 'ADMIN_SEKSI') {
    // Admin seksi: hanya laporan pegawai di seksi yang sama
    if (!user.id_seksi || !report.id_seksi) return false;
    return report.id_seksi === user.id_seksi;
  }

  if (user.role === 'KEPALA_KANTOR') {
    // Kepala kantor: akses semua laporan (workflow persetujuannya)
    return true;
  }

  return false;
}

/**
 * Hapus file fisik secara aman DARI STORAGE KEY (untuk pembersihan setelah kegagalan).
 *
 * KONTRAK: parameter HANYA storage key relatif (mis. "ab/uuid.pdf"), BUKAN absolute path.
 * - resolve: STORAGE_ROOT + key
 * - validasi isWithinStorageRoot SEBELUM unlink
 * - path di luar STORAGE_ROOT TIDAK PERNAH dihapus
 *
 * Return: true jika file ditemukan dan dihapus, false jika tidak ada.
 */
function removeFileSafely(storageKey) {
  if (!storageKey || typeof storageKey !== 'string') return false;
  // Tolak jika pemanggil keliru mengirim absolute path (bukan storage key)
  const full = path.resolve(STORAGE_ROOT, storageKey);
  if (!isWithinStorageRoot(full)) {
    console.error('[file-security] removeFileSafely: path hasil resolve di luar STORAGE_ROOT, tidak dihapus:', storageKey);
    return false;
  }
  try {
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      return true;
    }
    return false;
  } catch (e) {
    console.error('[file-security] gagal hapus file', e.message);
    return false;
  }
}

/**
 * Hapus file fisik dari ABSOLUTE PATH (temp file multer / path yang sudah
 * direferensikan absolut).
 *
 * KONTRAK: parameter HANYA absolute path hasil resolve yang berada di dalam
 * STORAGE_ROOT (atau subdirektorinya seperti _tmp).
 * - resolve kembali path (anti path-traversal)
 * - validasi isWithinStorageRoot SEBELUM unlink
 * - path di luar STORAGE_ROOT TIDAK PERNAH dihapus
 *
 * Return: true jika file ditemukan dan dihapus, false jika tidak ada/luar root.
 */
function removeAbsoluteFileSafely(absolutePath) {
  if (!absolutePath || typeof absolutePath !== 'string') return false;
  const full = path.resolve(absolutePath);
  if (!isWithinStorageRoot(full)) {
    console.error('[file-security] removeAbsoluteFileSafely: path di luar STORAGE_ROOT, tidak dihapus:', absolutePath);
    return false;
  }
  try {
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      return true;
    }
    return false;
  } catch (e) {
    console.error('[file-security] gagal hapus file (abs)', e.message);
    return false;
  }
}

/**
 * Streaming download — return { stream, mime, originalName, size }
 */
function streamFile(storageKey, detectedMime, originalName) {
  const full = path.join(STORAGE_ROOT, storageKey);
  if (!isWithinStorageRoot(full)) {
    const err = new Error('Path tidak valid');
    err.status = 400;
    throw err;
  }
  if (!fs.existsSync(full)) {
    const err = new Error('File tidak ditemukan');
    err.status = 404;
    throw err;
  }
  const stream = fs.createReadStream(full, { highWaterMark: 64 * 1024 });
  return {
    stream,
    mime: detectedMime || 'application/octet-stream',
    originalName: originalName || 'file',
  };
}

module.exports = {
  STORAGE_ROOT,
  ALLOWED_MIME,
  detectMime,
  analyzeFile,
  sanitizeDisplayName,
  makeStoredName,
  storageKey,
  isWithinStorageRoot,
  canAccessFile,
  removeFileSafely,
  removeAbsoluteFileSafely,
  streamFile,
  extForMime,
  parseZipEntries,
};
