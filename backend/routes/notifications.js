const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const result = await pool.query(
      `SELECT * FROM notifications WHERE id_user = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.user.id, parseInt(limit)]
    );
    const totalUnread = await pool.query(
      'SELECT COUNT(*) as cnt FROM notifications WHERE id_user = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({
      success: true,
      data: result.rows,
      unread: parseInt(totalUnread.rows[0].cnt)
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat notifikasi' });
  }
});

router.post('/read-all', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE id_user = $1 AND is_read = false",
      [req.user.id]
    );
    res.json({ success: true, message: 'Semua notifikasi dibaca' });
  } catch (error) {
    console.error('Error marking notifications:', error);
    res.status(500).json({ success: false, message: 'Gagal menandai notifikasi' });
  }
});

router.post('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "UPDATE notifications SET is_read = true WHERE id = $1 AND id_user = $2 RETURNING id",
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notifikasi tidak ditemukan' });
    }
    res.json({ success: true, message: 'Notifikasi dibaca' });
  } catch (error) {
    console.error('Error marking notification:', error);
    res.status(500).json({ success: false, message: 'Gagal memperbarui notifikasi' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM notifications WHERE id = $1 AND id_user = $2",
      [id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Notifikasi tidak ditemukan' });
    }
    res.json({ success: true, message: 'Notifikasi dihapus' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ success: false, message: 'Gagal menghapus notifikasi' });
  }
});

// GET /api/notifications/unread-count - Get unread notification count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as cnt FROM notifications WHERE id_user = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ success: true, data: { count: parseInt(result.rows[0].cnt) } });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat jumlah notifikasi' });
  }
});

module.exports = router;
