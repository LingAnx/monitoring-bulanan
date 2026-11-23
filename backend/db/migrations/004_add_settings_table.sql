-- Migration: Add settings table if not exists
-- Created: 2025-01-01
-- Purpose: Key-value store for system settings (Superadmin)

CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default settings
INSERT INTO settings (key, value, description)
VALUES
    ('app_name', 'KSOP Cirebon', 'Nama aplikasi'),
    ('app_version', '1.0.0', 'Versi aplikasi'),
    ('report_deadline_day', '10', 'Tenggat pengumpulan laporan per bulan (hari)'),
    ('enable_broadcast', 'true', 'Izinkan broadcast notifikasi')
ON CONFLICT (key) DO NOTHING;
