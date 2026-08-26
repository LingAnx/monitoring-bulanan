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
const pegawaiRoutes = require('./routes/pegawai');
const kepalaRoutes = require('./routes/kepala');
const superadminRoutes = require('./routes/superadmin');
const exportRoutes = require('./routes/export');
const adminSectionRoutes = require('./routes/adminSection');
const { authenticateToken } = require('./middleware/auth');
const { logger, requestLogger } = require('./middleware/logger');
const pool = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Validate required env variables
if (!process.env.JWT_SECRET) {
  logger.error('JWT_SECRET not set in .env file');
  process.exit(1);
}

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

// Request logging
app.use(requestLogger);

// Apply global rate limiter
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '..')));

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
app.use('/api/notifications', authenticateToken, notificationsRoutes);
app.use('/api/profile', authenticateToken, profileRoutes);
app.use('/api/pegawai', authenticateToken, pegawaiRoutes);
app.use('/api/kepala', authenticateToken, kepalaRoutes);
app.use('/api/superadmin', authenticateToken, superadminRoutes);
app.use('/api/export', authenticateToken, exportRoutes);
app.use('/api/admin-section', authenticateToken, adminSectionRoutes);

// Health check endpoint with DB check
app.get('/health', async (req, res) => {
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
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: {
        status: 'disconnected',
        error: error.message
      }
    });
  }
});

// Metrics endpoint (simple in-memory metrics)
let metrics = {
  requests: 0,
  errors: 0,
  startTime: Date.now(),
  lastError: null
};

app.get('/metrics', (req, res) => {
  res.json({
    uptime: `${Math.floor((Date.now() - metrics.startTime) / 1000)}s`,
    requests: metrics.requests,
    errors: metrics.errors,
    lastError: metrics.lastError,
    timestamp: new Date().toISOString()
  });
});

app.use((err, req, res, next) => {
  metrics.errors++;
  metrics.lastError = {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString()
  };
  
  logger.error('Error:', err);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'Origin tidak diizinkan' });
  }
  res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
});

// Track all requests for metrics
app.use((req, res, next) => {
  metrics.requests++;
  next();
});

app.use((req, res) => {
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
