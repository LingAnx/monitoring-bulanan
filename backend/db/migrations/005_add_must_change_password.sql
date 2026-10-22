-- ============================================================
-- 005_add_must_change_password.sql
-- Menambahkan kolom must_change_password ke tabel users.
-- Berfungsi untuk memaksa user yang password-nya berasal dari
-- dump data / seed untuk melakukan reset password setelah first login.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- Migration aman: tidak mengubah data existing secara destruktif.
-- Jika dump SQL membawa data user nyata, admin dapat secara manual
-- men-set flag ini untuk user yang perlu reset:
--   UPDATE users SET must_change_password = true WHERE id IN (2, 3, ...);
--
-- Catatan: Jangan jalankan UPDATE bulk tanpa izin eksplisit admin
-- dan verifikasi target row-nya terlebih dahulu.
