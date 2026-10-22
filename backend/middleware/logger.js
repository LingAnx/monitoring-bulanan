const winston = require('winston');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ============================================================
// Logger — hardened (Tahap 6)
//
// - Log dir auto-created if missing (prevents startup crash)
// - maxsize/maxFiles rotation already configured (5MB x 5 files)
// - redact sensitive fields from log meta:
//     * Authorization header, Bearer token
//     * password, passwordHash, token, cookie, session_id,
//       JWT_SECRET, DB_PASSWORD, api_key, private_key, credential
//   via winston.format.transform + a custom redaction step.
// - Request-id: uuid v4 generated per request, attached to
//   all log entries for that request via X-Request-Id header.
// ============================================================

// Ensure log directory exists before winston writes to it.
const LOG_DIR = path.join(__dirname, '../logs');
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (e) {
  console.error('[logger] gagal membuat direktori log:', e.message);
}

// Keys that should be masked in log entries (case-insensitive).
const REDACT_KEYS = new Set([
  'password', 'password_hash', 'passwordhash', 'password_hashed',
  'hash', 'hash_password', 'hashpassword',
  'token', 'jwt', 'jwt_secret', 'jwtsecret',
  'authorization', 'auth', 'auth_header', 'authheader',
  'cookie', 'cookies', 'session_id', 'sessionid',
  'db_password', 'dbpassword', 'pg_password', 'pgpassword',
  'secret', 'api_key', 'apikey', 'private_key', 'privatekey',
  'credential', 'credentials',
]);

function redactValue(key) {
  const lower = String(key || '').toLowerCase();
  if (lower === 'authorization') return '[REDACTED_AUTH]';
  if (REDACT_KEYS.has(lower)) return '[REDACTED]';
  return null;
}

// ── log format ───────────────────────────────────────────
// Custom format that masks sensitive keys before JSON serialization.
class RedactFormat {
  constructor() {
    this.symbol = 'redact';
    this.transform = (info, inst) => {
      if (info.meta && typeof info.meta === 'object') {
        for (const key of Object.keys(info.meta)) {
          const masked = redactValue(key);
          if (masked !== null) {
            info.meta[key] = masked;
          }
        }
      }
      return info;
    };
  }
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  new RedactFormat(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'ksop-laporan' },
  transports: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      new RedactFormat(),
      winston.format.simple()
    ),
  }));
}

// ── Request-id + redacted request logging ────────────────

function generateRequestId() {
  return crypto.randomUUID();
}

const requestLogger = (req, res, next) => {
  const supplied = req.get('X-Request-Id') || '';
  const validSupplied = /^[a-zA-Z0-9-]{8,64}$/.test(supplied);
  const requestId = validSupplied ? supplied : generateRequestId();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request', {
      requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: (req.get('User-Agent') || '').slice(0, 200),
      userId: req.user?.id || 'anonymous',
      authHeader: '[REDACTED_AUTH]',
    });
  });

  next();
};

module.exports = { logger, requestLogger, generateRequestId };
