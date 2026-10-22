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

// Stricter rate limit for auth endpoints
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

// Static: hanya public/
app.use(express.static(publicDir, {
  dotfiles: 'deny',
  index: false,
  fallthrough: true,
}));

// Cache headers per type
app.use(cacheHeaders);

// Uploads: hanya lewat route API (diproteksi auth), bukan static publik
// (route upload.js menggunakan multer — tidak perlu express.static di sini)
// Jika frontend perlu fetch lampiran, tambahkan endpoint API GET terproteksi
// di backend/routes/upload.js, bukan serve uploads/ sebagai static.

// Apply general rate limiter only to API routes
app.use('/api', globalLimiter);

// Auth routes with stricter rate limiting
app.use('/api/auth/login', authLimiter);
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
    logger.error('Health check failed:', error, { requestId: req.requestId });
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: {
        status: 'disconnected'
      }
    });
  }
});

// /ready — readiness probe (DB check). Duplicate of the earlier /ready
// that was already in the file; keep only one.

// Metrics endpoint (simple in-memory metrics)
// /metrics hanya untuk diagnostik operator — dilindungi oleh token
// METRICS_TOKEN (env). Jika env tidak diset, endpoint tetap terbuka
// hanya untuk IP localhost (127.0.0.1 / ::1 / ::) — semua lainnya 404.
// Tidak mengungkap detail error ke klien. lastError disimpan
// terbatas di error handler (tanpa stack trace) agar endpoint ini
// tidak menjadi vektor kebocoran informasi.
let metrics = {
  requests: 0,
  errors: 0,
  startTime: Date.now(),
  lastError: null,
  perStatus: {},
};

// Middleware: update metrics per request — harus BEFORE route handler
app.use((req, res, next) => {
  metrics.requests++;
  res.on('finish', () => {
    const bucket = Math.floor(res.statusCode / 100) + 'xx';
    metrics.perStatus[bucket] = (metrics.perStatus[bucket] || 0) + 1;
    if (res.statusCode >= 500) metrics.errors++;
  });
  next();
});

app.get('/metrics', (req, res) => {
  const metricsToken = process.env.METRICS_TOKEN;
  const ip = req.ip || req.socket?.remoteAddress || '';
  const isLocalhost = (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1');
  const authHeader = req.get('Authorization') || '';
  const hasToken = metricsToken && authHeader === `Bearer ${metricsToken}`;
  if (metricsToken && !hasToken && !isLocalhost) {
    return res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
  }
  res.json({
    uptime: `${Math.floor((Date.now() - metrics.startTime) / 1000)}s`,
    requests: metrics.requests,
    errors: metrics.errors,
    perStatus: metrics.perStatus,
    timestamp: new Date().toISOString()
  });
});

app.use((err, req, res, next) => {
  metrics.errors++;
  // Stack trace hanya untuk log server — TIDAK dikirim ke klien.
  // lastError.message disimpan terbatas (slice) agar /metrics tidak
  // membocorkan detail internal ke siapa pun yang bisa memanggilnya.
  metrics.lastError = {
    message: String(err.message || '').slice(0, 200),
    timestamp: new Date().toISOString()
  };

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
  // API 404: selalu JSON — jangan kembalikan HTML frontend
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
  }
  // Non-API 404: redirect ke landing untuk UX
  if (req.method === 'GET' && !req.path.endsWith('.css') && !req.path.endsWith('.js')) {
    return res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
  }
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
