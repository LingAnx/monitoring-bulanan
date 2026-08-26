-- Database schema untuk Sistem Pelaporan Kinerja Bulanan KSOP Kelas II Cirebon
-- 3-Level: Pegawai → Admin Seksi → Kepala Kantor

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
