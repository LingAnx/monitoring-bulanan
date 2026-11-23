-- Migration 008: perbaiki nama kolom audit_trail (details → detail)
--
-- Latar belakang:
--   - migration lama 001–007 memakai kolom `detail`
--   - baseline schema.sql sempat memakai `details` (salah satu
--     varian yang ditulis saat audit security 2026-10-26)
--   - seluruh kode aplikasi (routes/*.js) memakai `detail`
--
-- Kebijakan kolom KANONIK: `detail` (nama pada database lama +
-- seluruh query runtime).
-- Migration ini:
--   a. bila kolom `details` ada dan `detail` TIDAK ada
--      → rename `details` → `detail`
--   b. bila kedua-duanya ada
--      → salin data `detail` ke `details` bila `detail` kosong
--         lalu rename `details` → `detail` (data lama aman)
--   c. bila sudah ada `detail` saja
--      → tidak melakukan apa-apa (idempotent)
--
-- CATATAN DEPLOYMENT: setelah migration ini, SEMUA query
-- audit trail memakai kolom `detail`. Query kustom (reporting)
-- yang memakai `audit_trail.details` harus diupdate ke `detail`.

DO $$
DECLARE
    has_detail   BOOLEAN;
    has_details  BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_trail' AND column_name = 'detail'
    ) INTO has_detail;

    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_trail' AND column_name = 'details'
    ) INTO has_details;

    IF has_detail AND NOT has_details THEN
        -- Sudah benar — tidak perlu apa-apa (idempotent)
        RAISE NOTICE '008: audit_trail.detail sudah ada — lewati';

    ELSIF has_details AND NOT has_detail THEN
        -- Hanya `details` → rename ke `detail`
        ALTER TABLE audit_trail RENAME COLUMN details TO detail;
        RAISE NOTICE '008: kolom audit_trail.details → detail (rename)';

    ELSIF has_detail AND has_details THEN
        -- Kedua-duanya ada: salin data ke `detail` bila kolom
        -- `detail` kosong, lalu buang `details`.
        UPDATE audit_trail a
           SET detail = d.details
          FROM audit_trail d
         WHERE a.id = d.id
           AND (a.detail IS NULL OR a.detail = '')
           AND d.details IS NOT NULL;
        ALTER TABLE audit_trail DROP COLUMN details;
        RAISE NOTICE '008: data details disalin ke detail, kolom details dihapus';

    ELSE
        -- Tidak ada satu pun → tambah `detail`
        ALTER TABLE audit_trail ADD COLUMN detail TEXT;
        RAISE NOTICE '008: kolom audit_trail.detail ditambahkan';
    END IF;
END
$$;

-- Index untuk performa query audit berdasarkan tanggal
CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at ON audit_trail(created_at DESC);
