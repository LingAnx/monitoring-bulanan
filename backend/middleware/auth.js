const jwt = require('jsonwebtoken');
const pool = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET must be set in environment variables');
  process.exit(1);
}

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
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
        s.nama_seksi
      FROM users u
      LEFT JOIN seksi s ON s.id = u.id_seksi
      WHERE u.id = $1
    `, [decoded.userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User tidak ditemukan' });
    }
    
    req.user = userResult.rows[0];
    req.user.token = token;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token tidak valid atau telah kedaluwarsa' });
    }
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

module.exports = { authenticateToken, requireRole, JWT_SECRET };
