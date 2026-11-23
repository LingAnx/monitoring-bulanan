const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const path = require('path');
const authRoutes = require('./routes/auth');
const laporanRoutes = require('./routes/laporan');
const rekapRoutes = require('./routes/rekap');
const usersRoutes = require('./routes/users');
const seksiRoutes = require('./routes/seksi');
const notificationsRoutes = require('./routes/notifications');
const profileRoutes = require('./routes/profile');
const uploadRoutes = require('./routes/upload');
const filesRoutes = require('./routes/files');
const pegawaiRoutes = require('./routes/pegawai');
const kepalaRoutes = require('./routes/kepala');
const superadminRoutes = require('./routes/superadmin');
const exportRoutes = require('./routes/export');
const adminSectionRoutes = require('./routes/adminSection');
const { authenticateToken } = require('./middleware/auth');
const { logger, requestLogger } = require('./middleware/logger');
const { staticGuard, cacheHeaders, securityHeaders } = require('./middleware/static-guard');
const pool = require('./db/database');

// SECURITY: fail-fast — tolak startup jika konfigurasi tidak aman
require('./scripts/security-check');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting - global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: {
    success: false,
    message: 'Terlalu banyak permintaan, coba lagi nanti.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit ketat untuk endpoint kredensial (login).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS configuration
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:5501', 'http://127.0.0.1:3000', 'http://127.0.0.1:5501'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security headers — letakkan SEBELUM semua middleware lain
app.use(securityHeaders);

// Request logging
app.use(requestLogger);

// ── Static serving: hanya public/ ─────────────────────────
// publicDir dibuat oleh scripts/sync-frontend.sh dari file frontend di root.
// backend/, .env, *.sql, logs, uploads, dll. TIDAK berada di public/.
const publicDir = path.resolve(__dirname, '..', 'public');

// Defense-in-depth: tolak path sensitif sebelum static handler
app.use(staticGuard);

// Cache headers harus dipasang sebelum static handler mengakhiri response.
app.use(cacheHeaders);

// Static: hanya public/
app.use(express.static(publicDir, {
  dotfiles: 'deny',
  index: false,
  fallthrough: true,
}));

// Tampilan halaman utama ketika URL root dibuka.
app.get('/', (req, res, next) => {
  res.sendFile(path.join(publicDir, 'index.html'), (error) => {
    if (error) next(error);
  });
});

// ── Metrics (in-memory, diagnostik operator) ───────────────
// Middleware penghitung dipasang SEBELUM route handler agar
// SEMUA request terhitung (termasuk 404/4xx yang di-handle
// route) dan hanya SATU kali per request (flag `counted`).
// Error 5xx yang melewati global error handler TIDAK
// di-double-count — status class bucket sama dihitung saat
// `finish` event (satu-satunya titik pengukuran).
const SERVER_START = Date.now();
const metrics = {
  requests: 0,
  errors5xx: 0,
  perStatusClass: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
  startTime: SERVER_START,
};

// Middleware pembilang: dipasang SEBELUM globalLimiter/route sehingga
// SEMUA request terhitung (termasuk request yang ditolak rate-limit
// maupun 404 handler) — satu titik pengukuran, tanpa double-count.
// Tidak memakai flag `metricsCounted`: middleware ini hanya ada SATU,
// dan double-mount tidak terjadi karena server.js mengeksekusi file
// ini satu kali.
app.use((req, res, next) => {
  metrics.requests += 1;
  res.on('finish', () => {
    const bucket = Math.floor(res.statusCode / 100) + 'xx';
    if (metrics.perStatusClass[bucket] !== undefined) {
      metrics.perStatusClass[bucket] += 1;
    }
    if (res.statusCode >= 500) {
      metrics.errors5xx += 1;
    }
  });
  next();
});

// Uploads: hanya lewat route API (diproteksi auth), bukan static publik
// (route upload.js menggunakan multer — tidak perlu express.static di sini)
// Jika frontend perlu fetch lampiran, tambahkan endpoint API GET terproteksi
// di backend/routes/upload.js, bukan serve uploads/ sebagai static.

// Apply general rate limiter only to API routes
app.use('/api', globalLimiter);

// Password endpoints (login) — limiter ketat, dipasang SEBELUM
// mount router. /change-password memakai authLimiter (max 10/15m)
// karena sudah di-require authenticateChangePassword.
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/change-password', authLimiter);
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/laporan', authenticateToken, laporanRoutes);
app.use('/api/rekap', authenticateToken, rekapRoutes);
app.use('/api/users', authenticateToken, usersRoutes);
app.use('/api/seksi', authenticateToken, seksiRoutes);
app.use('/api/upload', authenticateToken, uploadRoutes);
app.use('/api/files', authenticateToken, filesRoutes);
app.use('/api/notifications', authenticateToken, notificationsRoutes);
app.use('/api/profile', authenticateToken, profileRoutes);
app.use('/api/pegawai', authenticateToken, pegawaiRoutes);
app.use('/api/kepala', authenticateToken, kepalaRoutes);
app.use('/api/superadmin', authenticateToken, superadminRoutes);
app.use('/api/export', authenticateToken, exportRoutes);
app.use('/api/admin-section', authenticateToken, adminSectionRoutes);

// Health check endpoint with DB check
// /health — liveness probe: responds fast without a DB round-trip.
// Used by orchestrators to decide if the container should be restarted.
// /ready — readiness probe: verifies the API is actually usable
// (DB reachable, migrations applied). Used by load-balancers to gate traffic.
app.get('/health', (req, res) => {
  // Liveness: just check that the process is alive. No DB call.
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', async (req, res) => {
  try {
    const start = Date.now();
    const dbResult = await pool.query('SELECT 1');
    const duration = Date.now() - start;
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: {
        status: 'connected',
        responseTime: `${duration}ms`
      }
    });
  } catch (error) {
    // Log detail di server — respons hanya memberi tahu status
    // koneksi, tanpa pesan error mentah (bisa memuat kredensial/string koneksi).
    // lastError: pesan error DISANITASI (max 200 char, tanpa indikasi
    // credential) agar operator tetap dapat diagnosa tanpa kebocoran.
    logger.error('Health check failed:', error, { requestId: req.requestId });
    let lastError = 'unknown error';
    if (error && error.message) {
      const msg = String(error.message).replace(/^Error:/i, '').trim();
      if (!/password|credential|PGPASSWORD/i.test(msg)) {
        lastError = msg.slice(0, 200);
      }
    }
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: {
        status: 'disconnected',
        lastError
      }
    });
  }
});

// /ready — readiness probe (DB check). Duplicate of the earlier /ready
// that was already in the file; keep only one.



// /metrics — diagnostik operator. Proteksi dua-lapis:
//  1. Bila METRICS_TOKEN diset: hanya pemanggil dengan
//     `Authorization: Bearer $METRICS_TOKEN` yang lolos (untuk
//     IP mana pun — misalnya dari jaringan operator).
//  2. Tanpa METRICS_TOKEN: hanya IP localhost (127.0.0.1 / ::1 /
//     ::ffff:127.0.0.1) yang diterima; semua yang lain → 404
//     (endpoint tidak terlihat, bukan 403 — hindari fingerprinting).
// Respon hanya angka agregat + uptime — TANPA stack trace, tanpa
// detail SQL, tanpa isi request, tanpa credential.
app.get('/metrics', (req, res) => {
  const metricsToken = process.env.METRICS_TOKEN;
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || '';
  const isLocalhost = (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1');
  if (metricsToken) {
    const authHeader = req.get('Authorization') || '';
    // Constant-time compare untuk anti timing attack.
    const crypto = require('crypto');
    const a = Buffer.from(authHeader, 'utf8');
    const b = Buffer.from(`Bearer ${metricsToken}`, 'utf8');
    const lengthOk = a.length === b.length;
    const eq = lengthOk && crypto.timingSafeEqual(a, b);
    if (!eq) {
      return res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
    }
  } else if (!isLocalhost) {
    // Tanpa token: hanya localhost.
    return res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
  }
  res.json({
    uptimeSeconds: Math.floor((Date.now() - SERVER_START) / 1000),
    requests: metrics.requests,
    errors5xx: metrics.errors5xx,
    perStatusClass: metrics.perStatusClass,
    timestamp: new Date().toISOString(),
  });
});

app.use((err, req, res, next) => {
  // (Pembilang metrics sudah di `finish` event — tidak ditambah
  // di sini agar tidak double-count.)
  // Stack trace hanya untuk log server — TIDAK dikirim ke klien.
  logger.error('Error:', err, { requestId: req.requestId });

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'Origin tidak diizinkan' });
  }
  // Multer fileFilter / limits error — hormati status code yang di-set
  if (err.status && [400, 401, 403, 413, 415].includes(err.status)) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  // File size exceeded (multer LIMIT_FILE_SIZE)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'Ukuran file melebihi batas maksimum' });
  }
  // Pesan generik — detail ada di log server, bukan di respons.
  res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
});

app.use((req, res) => {
  // Semua path yang tidak ditemukan menghasilkan JSON 404 yang konsisten.
  res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
});

app.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    jwtSecretSet: !!process.env.JWT_SECRET,
    corsOrigin: allowedOrigins.join(', '),
    nodeEnv: process.env.NODE_ENV
  });
});
