-- Migration: Add CHECK constraint to enforce canonical role values
-- Only runs if constraint does not already exist
-- This prevents future insertion of invalid role values

DO $$
BEGIN
    -- Check if constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_users_role_valid'
    ) THEN
        -- Add CHECK constraint
        ALTER TABLE users 
        ADD CONSTRAINT chk_users_role_valid 
        CHECK (role IN ('PEGAWAI', 'ADMIN_SEKSI', 'KEPALA_KANTOR', 'SUPERADMIN'));
        
        RAISE NOTICE 'Added CHECK constraint chk_users_role_valid to users.role';
    END IF;
END
$$;

-- Verify constraint was added
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'chk_users_role_valid';
