-- Migration 006: Tambah tabel `files` untuk metadata lampiran terpusat
-- Tujuan: menggantikan pola lampiran JSONB berisi URL /uploads/<nama> yang
--          membuat file dapat diakses tanpa autentikasi.
-- Aman dijalankan ulang (IF NOT EXISTS + ON CONFLICT).
-- Tidak menghapus field `lampiran` dari tabel `laporan` —
-- pola lama dipertahankan sebagai migrasi bertahap.

CREATE TABLE IF NOT EXISTS files (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_id     INTEGER REFERENCES laporan(id) ON DELETE CASCADE,
    original_name VARCHAR(255) NOT NULL,
    stored_name   VARCHAR(255) NOT NULL UNIQUE,
    detected_mime_type VARCHAR(100) NOT NULL,
    size_bytes    BIGINT NOT NULL CHECK (size_bytes > 0),
    sha256        CHAR(64) NOT NULL,
    storage_key   VARCHAR(500) NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP
);

-- Index untuk query utama
CREATE INDEX IF NOT EXISTS idx_files_owner    ON files(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_files_report   ON files(report_id);
CREATE INDEX IF NOT EXISTS idx_files_deleted  ON files(deleted_at) WHERE deleted_at IS NULL;

-- Catatan:
-- - storage_key TIDAK dikirim ke klien; hanya id (UUID) yang dipakai untuk download.
-- - ON DELETE CASCADE pada owner_user_id dan report_id:
--   saat pengguna atau laporan dihapus, metadata file ikut terhapus (soft delete).
--   File fisik dibersihkan oleh script orphan-cleanup terpisah.
-- - deleted_at: soft delete — file tidak dihapus permanen selama deleted_at IS NULL.
