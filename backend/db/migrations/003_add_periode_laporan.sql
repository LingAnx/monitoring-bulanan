-- Migration: Add canonical periode_laporan table
-- Project: Sistem Digitalisasi Laporan Kinerja Bulanan KSOP Cirebon
--
-- Canonical period table:
-- periode_laporan
--
-- IMPORTANT:
-- 1. This migration only creates the canonical period table.
-- 2. This migration does NOT automatically migrate data from legacy table "periode".
-- 3. This migration does NOT drop the legacy table.
-- 4. Legacy data must be inspected before any manual migration.
--
-- Reason:
-- The legacy table structure has not been fully verified.
-- Automatically reading columns such as deadline_date or is_active
-- could fail or migrate incorrect data.

CREATE TABLE IF NOT EXISTS periode_laporan (
    id SERIAL PRIMARY KEY,

    bulan INTEGER NOT NULL
        CONSTRAINT chk_periode_laporan_bulan
        CHECK (bulan >= 1 AND bulan <= 12),

    tahun INTEGER NOT NULL
        CONSTRAINT chk_periode_laporan_tahun
        CHECK (tahun >= 2000 AND tahun <= 2100),

    tanggal_mulai DATE NOT NULL,

    deadline DATE NOT NULL,

    status VARCHAR(50) NOT NULL DEFAULT 'aktif'
        CONSTRAINT chk_periode_laporan_status
        CHECK (status IN ('aktif', 'ditutup')),

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Prevent duplicate reporting periods for the same month and year.
CREATE UNIQUE INDEX IF NOT EXISTS uk_periode_laporan_bulan_tahun
    ON periode_laporan (bulan, tahun);

-- Legacy table "periode" is intentionally NOT modified or deleted here.
--
-- Before migrating legacy data, inspect the actual database first:
--
-- SELECT table_name
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('periode', 'periode_laporan');
--
-- If legacy table "periode" exists, inspect its columns:
--
-- SELECT
--     column_name,
--     data_type,
--     is_nullable,
--     column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'periode'
-- ORDER BY ordinal_position;
--
-- Only after the legacy schema is confirmed should a separate,
-- explicit data migration be created.