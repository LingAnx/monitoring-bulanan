-- Database schema untuk Sistem Pelaporan Kinerja Bulanan KSOP Kelas II Cirebon
-- 3-Level: Pegawai → Admin Seksi → Kepala Kantor
--
-- STRATEGY:
--   schema.sql = BASELINE (fresh deployment). Apply this once to create
--   all core objects deterministically.
--   Migrations (001–007) = incremental changes for EXISTING databases.
--   Do NOT re-run migrations on a database that was created from this
--   baseline; they are idempotent but intended for evolving live data.
--
--   Fresh deployment workflow:
--     1. psql -f backend/db/schema.sql
--     2. npm run db:migrate   (all .sql migrations will show APPLIED / skip)
--   OR simply skip step 2 — baseline already includes all migration objects.

-- Seksi (units/departments)
CREATE TABLE IF NOT EXISTS seksi (
    id SERIAL PRIMARY KEY,
    nama_seksi VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    nama VARCHAR(255) NOT NULL,
    nip VARCHAR(50),
    id_seksi INTEGER REFERENCES seksi(id) ON DELETE SET NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'PEGAWAI',
    is_active BOOLEAN DEFAULT true,
    must_change_password BOOLEAN NOT NULL DEFAULT false,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_users_role_valid
        CHECK (role IN ('PEGAWAI', 'ADMIN_SEKSI', 'KEPALA_KANTOR', 'SUPERADMIN'))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_seksi ON users(id_seksi);
-- Compound index for optimized joins
CREATE INDEX IF NOT EXISTS idx_users_seksi_role ON users(id_seksi, role);

-- Laporan (reports)
CREATE TABLE IF NOT EXISTS laporan (
    id SERIAL PRIMARY KEY,
    id_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    judul VARCHAR(255) NOT NULL,
    bulan INTEGER NOT NULL CHECK (bulan >= 1 AND bulan <= 12),
    tahun INTEGER NOT NULL CHECK (tahun >= 2000 AND tahun <= 2100),
    isi_kegiatan TEXT,
    capaian TEXT,
    kendala TEXT,
    tindak_lanjut TEXT,
    rencana_bulan_depan TEXT,
    lampiran JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    catatan_admin TEXT,
    catatan_kantor TEXT,
    tanggal_pengajuan TIMESTAMP,
    tanggal_verifikasi TIMESTAMP,
    tanggal_persetujuan TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_laporan_user ON laporan(id_user);
CREATE INDEX IF NOT EXISTS idx_laporan_seksi ON laporan(id_user);
CREATE INDEX IF NOT EXISTS idx_laporan_bulan_tahun ON laporan(bulan, tahun);
CREATE INDEX IF NOT EXISTS idx_laporan_status ON laporan(status);
CREATE INDEX IF NOT EXISTS idx_laporan_created_at ON laporan(created_at DESC);
-- Compound indexes for optimized queries
CREATE INDEX IF NOT EXISTS idx_laporan_user_status ON laporan(id_user, status);
CREATE INDEX IF NOT EXISTS idx_laporan_user_bulan_tahun ON laporan(id_user, bulan, tahun);

-- Verifikasi (verification by Admin Seksi)
CREATE TABLE IF NOT EXISTS verifikasi (
    id SERIAL PRIMARY KEY,
    id_laporan INTEGER NOT NULL REFERENCES laporan(id) ON DELETE CASCADE,
    id_admin_seksi INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verifikasi_laporan ON verifikasi(id_laporan);

-- Persetujuan (approval by Kepala Kantor)
CREATE TABLE IF NOT EXISTS persetujuan (
    id SERIAL PRIMARY KEY,
    id_laporan INTEGER NOT NULL REFERENCES laporan(id) ON DELETE CASCADE,
    id_kepala INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_persetujuan_laporan ON persetujuan(id_laporan);

-- Audit trail
CREATE TABLE IF NOT EXISTS audit_trail (
    id SERIAL PRIMARY KEY,
    id_laporan INTEGER REFERENCES laporan(id) ON DELETE CASCADE,
    id_user INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    detail TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_laporan ON audit_trail(id_laporan);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_trail(id_user);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_trail(created_at DESC);

-- Notifications (read by user, auto-cleared on read)
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    id_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'info',
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(id_user, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Settings (key-value store for system settings — Superadmin)
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Files (centralised attachment metadata — replaces raw /uploads/ static paths)
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

CREATE INDEX IF NOT EXISTS idx_files_owner   ON files(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_files_report  ON files(report_id);
CREATE INDEX IF NOT EXISTS idx_files_deleted ON files(deleted_at) WHERE deleted_at IS NULL;

-- Period/Laporan Period (reporting periods)
CREATE TABLE IF NOT EXISTS periode_laporan (
    id SERIAL PRIMARY KEY,
    bulan INTEGER NOT NULL CHECK (bulan >= 1 AND bulan <= 12),
    tahun INTEGER NOT NULL CHECK (tahun >= 2000 AND tahun <= 2100),
    tanggal_mulai DATE NOT NULL,
    deadline DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'aktif' 
    CHECK (status IN ('aktif', 'ditutup')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_periode_laporan_bulan_tahun ON periode_laporan (bulan, tahun);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_laporan_updated_at BEFORE UPDATE ON laporan
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
