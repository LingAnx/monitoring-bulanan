-- Migration: Normalize role values to canonical uppercase format
-- Converts legacy lowercase roles to canonical form
-- Run this once to migrate existing database data

-- Update role values from lowercase to canonical uppercase
UPDATE users 
SET role = CASE role
    WHEN 'pegawai' THEN 'PEGAWAI'
    WHEN 'admin_seksi' THEN 'ADMIN_SEKSI'
    WHEN 'kepala_kantor' THEN 'KEPALA_KANTOR'
    WHEN 'admin' THEN 'SUPERADMIN'
    WHEN 'superadmin' THEN 'SUPERADMIN'
    ELSE role
END
WHERE role IN ('pegawai', 'admin_seksi', 'kepala_kantor', 'admin', 'superadmin');

-- Verify migration results
SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY role;
