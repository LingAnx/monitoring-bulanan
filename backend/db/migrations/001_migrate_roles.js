// ══════════════════════════════════════════════════
// NON-CANONICAL — REFERENCE ONLY
// This JavaScript file is kept as a reference implementation.
// The CANONICAL migration method for this project is SQL.
// Run the SQL migration instead:
//   psql -d <database> -f backend/db/migrations/001_normalize_role_values.sql
// ══════════════════════════════════════════════════
const pool = require('../../db/database');

/**
 * Migrate role values from legacy lowercase to canonical uppercase format
 */
async function migrateRoleValues() {
  const updates = [
    { from: 'pegawai', to: 'PEGAWAI' },
    { from: 'admin_seksi', to: 'ADMIN_SEKSI' },
    { from: 'kepala_kantor', to: 'KEPALA_KANTOR' },
    { from: 'admin', to: 'SUPERADMIN' },
    { from: 'superadmin', to: 'SUPERADMIN' }
  ];

  let updated = 0;
  
  for (const { from, to } of updates) {
    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE role = $2 RETURNING id, username, role',
      [to, from]
    );
    updated += result.rows.length;
    if (result.rows.length > 0) {
      console.log(`Migrated ${result.rows.length} user(s): ${from} → ${to}`);
      result.rows.forEach(row => {
        console.log(`  - User ${row.id} (${row.username}): ${from} → ${to}`);
      });
    }
  }

  // Verify final state
  const verify = await pool.query('SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY role');
  console.log('\n=== Migration Complete ===');
  console.log(`Total users migrated: ${updated}`);
  console.log('Current role distribution:');
  verify.rows.forEach(row => {
    console.log(`  ${row.role}: ${row.count} user(s)`);
  });
}

migrateRoleValues().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
