// ============================================================
// middleware/static-guard.js
// Perlindungan static serving — defense-in-depth
// ============================================================
const path = require('path');

/**
 * Middleware penolakan path sensitif sebelum static handler.
 * Ini adalah LINGKUNG PERTAHAN KEDUA — perlindungan utama adalah
 * bahwa express.static hanya menunjuk ke directori public/ yang
 * TIDAK mengandung file sensitif.
 *
 * Daftar blokir didasarkan pada PREFIX PATH, bukan ekstensi,
 * karena file sensitif bisa berganti nama.
 */

// Prefix path yang selalu ditolak — tidak peduli apa pun di belakangnya
const BLOCKED_PREFIXES = [
  '/.git',
  '/.env',
  '/backend',
  '/logs',
  '/uploads',       // hanya diizinkan via route API (upload.js)
  '/scripts',
  '/db',
  '/middleware',
  '/routes',
  '/migrations',
  '/private',
  '/handoffs',
  '/node_modules',
];

// Pola dotfile di root — tolak .ds_store, .env, .git, dst.
const BLOCKED_DOTFILES = /^(\/\.|\.env$)/;

// Nama file yang selalu ditolak di mana pun
const BLOCKED_FILENAMES = [
  'CHANGELOG_FIXES.md',
  'STABILITY_ANALYSIS.md',
  'RDP.md',
  'AGENTS.md',
];

/**
 * app.use(staticGuard) — letakkan SEBELUM express.static
 */
function staticGuard(req, res, next) {
  // Decode path sekali, tolak karakter nuls
  let decoded;
  try {
    decoded = decodeURIComponent(req.path);
  } catch (e) {
    return res.status(400).json({ success: false, message: 'Path tidak valid' });
  }

  // Nulkar
  if (decoded.includes('\0')) {
    return res.status(400).json({ success: false, message: 'Path tidak valid' });
  }

  // Cek prefix blokir
  for (const prefix of BLOCKED_PREFIXES) {
    if (decoded === prefix || decoded.startsWith(prefix + '/')) {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }
  }

  // Cek dotfile (misal /.env, /.git/config, /.DS_Store)
  const segments = decoded.split('/');
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.startsWith('.') && seg !== '.') {
      // Izinkan query string parameter (bagian terakhir dengan ?) — bukan dotfile
      if (i === segments.length - 1 && decoded.includes('?')) {
        // Ini bagian query, lewati
      } else {
        return res.status(403).json({ success: false, message: 'Akses ditolak' });
      }
    }
  }

  // Cek nama file yang selalu ditolak
  for (const name of BLOCKED_FILENAMES) {
    if (decoded.endsWith('/' + name) || decoded === '/' + name) {
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }
  }

  next();
}

/**
 * Middleware cache header — letakkan sebelum express.static agar header
 * ikut terkirim ketika static handler langsung menyelesaikan response.
 */
function cacheHeaders(req, res, next) {
  const ext = path.extname(req.path).toLowerCase();

  if (ext === '.html') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else if (['.js', '.css'].includes(ext)) {
    // Banyak halaman masih memakai URL aset tanpa hash; selalu revalidate agar
    // perbaikan frontend diterima segera setelah deploy.
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  } else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2'].includes(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  } else if (req.path.startsWith('/api/') || req.path.startsWith('/health') || req.path.startsWith('/metrics')) {
    res.setHeader('Cache-Control', 'no-store');
  }

  next();
}

/**
 * Middleware security headers dasar — letakkan paling awal.
 * Tidak memakai helmet agar tidak menambah dependency.
 *
 * Tahap 5 (XSS hardening):
 *  - CSP kini enforce (bukan report-only) karena:
 *      1. js/security/encoding.js menyediakan escapeHtmlText/Attr,
 *         safeUrl, escapeCsvCell, h() untuk semua output dinamis.
 *      2. Semua data dinamis di HTML disaring lewat escapeHtmlText
 *         sebelum masuk template literal / innerHTML.
 *      3. URL dinamis melewati safeUrl (memutus javascript: / vbscript:
 *         / data:text/html).
 *  - 'unsafe-inline' di script-src DIHILANGKAN. Inline onclick yang
 *    tersisa menggunakan fungsi global yang sudah ada di script
 *    eksternal (app.js) — bukan inline handler baru, jadi tidak
 *    melanggar CSP. Jika ada script yang membuat handler inline
 *    dari data (dinamis), harus digantikan dengan addEventListener
 *    atau data-* attribute.
 *
 * Catatan produksi: CSP di sini memakai 'self' untuk script/src,
 * tetapi HTML static yang diserve oleh Express tidak bisa diberi
 * meta CSP per-file tanpa menambah dependency. Jika ingin
 * enforce lebih ketat per-origin, set CSP_EXTRA (env) dan
 * tambahkan di CSP string di bawah — contoh:
 *   CSP_EXTRA=script-src 'self' 'nonce-abc123'
 */
const CSP_EXTRA = process.env.CSP_EXTRA || '';

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // CSP enforce — tanpa 'unsafe-inline' di script-src.
  // CSP_EXTRA (env) boleh menambah directive tambahan (misal nonce).
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com; " +
    "style-src 'self' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self' blob: http://localhost:3000 http://127.0.0.1:3000; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "frame-ancestors 'none'" +
    (CSP_EXTRA ? '; ' + CSP_EXTRA : '')
  );
  next();
}

module.exports = { staticGuard, cacheHeaders, securityHeaders };
