const jwt = require('jsonwebtoken');
const pool = require('../db/database');

// ============================================================
// JWT Config — centralized, hardened
// ============================================================
//
// - JWT_SECRET:  wajib, minimal 32 char ≈ 128 bit entropi
//   (HMAC-SHA256 butuh minimal 128 bit agar brute-force offline
//   tidak layak dalam timeframe threat model internal).
// - JWT_ISSUER / JWT_AUDIENCE:  bound token ke aplikasi ini;
//   token yang issued aplikasi lain (atau replay lintas app)
//   ditolak.
// - JWT_EXPIRES:  default 12 jam — cukup untuk sesi kerja harian,
//   jendela brute-force offline terbatas. Override via env
//   (mis. 4h untuk high-security, 24h untuk lapangan).
// - algorithm:  HS256 eksplisit — mencegah alg-confusion attack
//   (attacker swap "alg":"none" atau RS256/HS256).
// - token_version:  revokasi massal — setiap perubahan password /
//   role / deaktivasi akun meng-increment token_version di DB,
//   JWT lama ditolak oleh middleware.
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || 'ksop-laporan';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ksop-laporan-app';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '12h';
const JWT_ALGORITHM = 'HS256';

// Fail-fast: tolak startup jika secret masih default/placeholder atau
// terlalu pendek.
if (!JWT_SECRET ||
    JWT_SECRET === 'your_jwt_secret_here' ||
    JWT_SECRET === 'default_secret_key_1234567890' ||
    JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET wajib diset (minimal 32 karakter, bukan nilai default).');
  process.exit(1);
}

/**
 * signUserToken(user) → string
 * Buat JWT untuk user yang sudah terverifikasi. Dipakai di
 * routes/auth.js (login).
 *
 * Payload:
 *   - sub:  user.id (numeric)
 *   - userId:  user.id (compat frontend lama yang baca decoded.userId)
 *   - role:  user.role
 *   - token_version: revokasi massal
 *   - iat / exp / iss / aud / algorithm:  standar
 */
function signUserToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      token_version: user.token_version ?? 0,
    },
    JWT_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: JWT_EXPIRES,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      subject: String(user.id),
    }
  );
}

// ============================================================
// Token SEMENTARA purpose 'password-change'
// ------------------------------------------------------------
// Digunakan HANYA oleh PUT /api/auth/change-password untuk alur
// must_change_password=true. Sifat:
//   - audience berbeda dari sesi penuh ('ksop-laporan-pwd-change')
//     → token ini TIDAK bisa dipakai di endpoint aplikasi lain
//     (authenticateToken memverifikasi audience 'ksop-laporan-app'
//      dan menolak token pwd-change, dan sebaliknya).
//   - expiry 10 menit (override via env PASSWORD_CHANGE_TOKEN_TTL).
//   - terikat user.id + token_version — begitu password berubah
//     (token_version +1), token lama otomatis ditolak.
//   - claim `purpose: 'password-change'` sebagai penanda.
// ============================================================
const PWD_CHANGE_AUDIENCE = 'ksop-laporan-pwd-change';
const PWD_CHANGE_TTL = process.env.PASSWORD_CHANGE_TOKEN_TTL || '10m';

function signPasswordChangeToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      purpose: 'password-change',
      token_version: user.token_version ?? 0,
    },
    JWT_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: PWD_CHANGE_TTL,
      issuer: JWT_ISSUER,
      audience: PWD_CHANGE_AUDIENCE,
      subject: String(user.id),
    }
  );
}

/**
 * verifyPasswordChangeToken(token) →
 *   { ok: true, userId, token_version } | { ok: false, reason }
 * Dikembalikan sebagai result object (bukan throw) agar route
 * bisa memetakan alasan penolakan ke pesan 401 yang aman.
 */
function verifyPasswordChangeToken(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: PWD_CHANGE_AUDIENCE,
    });
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return { ok: false, reason: 'Token sementara sudah kedaluwarsa — silakan login ulang' };
    }
    return { ok: false, reason: 'Token tidak valid atau telah kedaluwarsa' };
  }
  if (decoded.purpose !== 'password-change') {
    return { ok: false, reason: 'Token tidak valid' };
  }
  const userId = Number(decoded.sub ?? decoded.userId);
  if (!userId || Number.isNaN(userId)) {
    return { ok: false, reason: 'Token tidak valid' };
  }
  return { ok: true, userId, token_version: decoded.token_version };
}

/**
 * verifyAppToken(token) →
 *   { ok: true, userId, token_version, role, decoded } |
 *   { ok: false, reason }
 *
 * PURE — tidak menyentuh req/res/next. Tidak mengirim respons.
 * Return object eksplisit; caller memutuskan status code.
 * Dipakai oleh:
 *   - authenticateToken (Express middleware)
 *   - authenticateChangePassword di routes/auth.js
 */
function verifyAppToken(token) {
  if (!token) {
    return { ok: false, reason: 'Token tidak ditemukan' };
  }
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch (e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') {
      return { ok: false, reason: 'Token tidak valid atau telah kedaluwarsa' };
    }
    return { ok: false, reason: 'Token tidak valid' };
  }
  const userId = Number(decoded.sub ?? decoded.userId);
  if (!userId || Number.isNaN(userId)) {
    return { ok: false, reason: 'Token tidak valid' };
  }
  return { ok: true, userId, token_version: decoded.token_version, role: decoded.role, decoded };
}

/**
 * authenticateToken
 *
 * Proses:
 *  1. Extract Bearer dari Authorization header saja — token di
 *     query string DITOLAK (bisa bocor ke referrer/log/proxy).
 *  2. panggil verifyAppToken (pure) — audience app.
 *  3. Cek user di DB + is_active + token_version
 *     (revokasi massal setelah password/role/deactivate).
 *  4. Cek must_change_password → 401 khusus jika flag ON.
 *  5. Set req.user, req.user.token, req.user.tokenVersion.
 */
const authenticateToken = async (req, res, next) => {
  try {
    // (1) Hanya Bearer di Authorization — tolak query string.
    const authHeader = req.headers['authorization'] || '';
    const parts = authHeader.split(' ');
    const token = parts.length === 2 && parts[0].toUpperCase() === 'BEARER' ? parts[1] : null;

    // Tolak token di query string — vektor kebocoran referrer.
    if (!token && req.query.access_token) {
      return res.status(400).json({
        success: false,
        message: 'Token hanya diterima di header Authorization (Bearer)'
      });
    }

    // (2) Pure verify — no response side-effects here.
    const vres = verifyAppToken(token);
    if (!vres.ok) {
      return res.status(401).json({ success: false, message: vres.reason });
    }

    const userId = vres.userId;

    // (3) Cek DB: aktif + token_version.
    const userResult = await pool.query(`
      SELECT
        u.id,
        u.username,
        u.nama,
        u.nip,
        u.role,
        u.id_seksi,
        u.is_active,
        u.created_at,
        u.must_change_password,
        u.token_version,
        s.nama_seksi
      FROM users u
      LEFT JOIN seksi s ON s.id = u.id_seksi
      WHERE u.id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User tidak ditemukan' });
    }

    const user = userResult.rows[0];

    // Deactivated users lose access immediately, even with a valid JWT.
    if (user.is_active === false || user.is_active === 'f') {
      return res.status(401).json({ success: false, message: 'Akun nonaktif' });
    }

    // (4) Token revocation — jika user baru ganti password / role /
    //     dinonaktifkan, token_version di DB sudah increment, dan
    //     JWT lama (token_version lama) ditolak. Token awal yang
    //     tidak membawa claim (legacy pre-007) diberi tolansi:
    //     DB token_version 0 dianggap cocok.
    const dbVersion = user.token_version || 0;
    if (vres.token_version === undefined) {
      if (dbVersion !== 0) {
        return res.status(401).json({
          success: false,
          message: 'Sesi telah dicabut — silakan login ulang'
        });
      }
    } else if (vres.token_version !== dbVersion) {
      return res.status(401).json({
        success: false,
        message: 'Sesi telah dicabut — silakan login ulang'
      });
    }

    // (5) Force password change — HANYA jalur sesi penuh (app
    // audience) yang ditolak di sini. Bila flag ON, user harus
    // login ulang dan memakai token SEMENTARA purpose
    // 'password-change' di PUT /api/auth/change-password.
    if (user.must_change_password === true || user.must_change_password === 't') {
      return res.status(401).json({
        success: false,
        message: 'Password wajib diubah sebelum melanjutkan',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
    }

    req.user = user;
    req.user.token = token;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Akses ditolak' });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireRole,
  signUserToken,
  signPasswordChangeToken,
  verifyAppToken,
  verifyPasswordChangeToken,
  PWD_CHANGE_AUDIENCE,
  JWT_SECRET,
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_EXPIRES,
  JWT_ALGORITHM,
};
