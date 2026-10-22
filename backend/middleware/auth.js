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
 * routes/auth.js (login, change-password, reset-password).
 *
 * Payload:
 *   - sub:  user.id (numeric)
 *   - userId:  user.id (compat frontend lama yang baca decoded.userId)
 *   - role:  user.role
 *   - iat / exp / iss / aud / algorithm:  standar
 */
function signUserToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role },
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

/**
 * authenticateToken
 *
 * Proses:
 *  1. Extract Bearer dari Authorization header saja — token di
 *     query string DITOLAK (bisa bocor ke referrer/log/proxy).
 *  2. Verifikasi signature, exp, iss, aud, dan bahwa algoritma
 *     yang dipakai token = HS256.
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

    if (!token) {
      return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
    }

    // (2) Verifikasi — explicit algorithm, issuer, audience.
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch (e) {
      if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token tidak valid atau telah kedaluwarsa' });
      }
      throw e;
    }

    const userId = Number(decoded.sub ?? decoded.userId);
    if (!userId || Number.isNaN(userId)) {
      return res.status(401).json({ success: false, message: 'Token tidak valid' });
    }

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
    //     JWT lama (token_version lama) ditolak.
    if (decoded.token_version !== undefined && decoded.token_version !== user.token_version) {
      return res.status(401).json({
        success: false,
        message: 'Sesi telah dicabut — silakan login ulang'
      });
    }

    // (5) Force password change.
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
  JWT_SECRET,
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_EXPIRES,
  JWT_ALGORITHM,
};
