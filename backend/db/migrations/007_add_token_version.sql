-- ============================================================
-- 007_add_token_version.sql
-- Menambahkan kolom token_version ke users untuk
-- revokasi JWT massal (logout-all).
--
-- Setiap kali password diubah, role dirombak, atau akun
-- dinonaktifkan, token_version di-increment. Middleware
-- auth membandingkan token_version dalam JWT dengan nilai
-- DB; jika beda, token ditolak (revoked).
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
