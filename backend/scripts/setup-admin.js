// ══════════════════════════════════════════════════
// SUPPORTED BOOTSTRAP UTILITY — setup-admin.js
// Creates or updates a single SUPERADMIN user.
// Usage: npm run setup-admin [username] [password] [nama]
// For full seed data, use: npm run setup-seed
// ══════════════════════════════════════════════════
const bcrypt = require('bcrypt');
const pool = require('../db/database');

async function setupAdmin() {
  try {
    const username = process.argv[2] || 'admin';
    const password = process.argv[3] || 'admin123';
    const nama = process.argv[4] || 'Administrator';

    console.log('🔐 Setting up admin user...');
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);
    console.log(`Nama: ${nama}`);

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    
    if (existingUser.rows.length > 0) {
      console.log('⚠️  User already exists. Updating password...');
      
      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // Update password and role to canonical SUPERADMIN
      await pool.query(
        'UPDATE users SET password = $1, nama = $2, role = $3 WHERE username = $4',
        [hashedPassword, nama, 'SUPERADMIN', username]
      );
      
      console.log('✅ Admin user password updated and role set to SUPERADMIN!');
    } else {
      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // Insert new admin user with canonical SUPERADMIN role
      await pool.query(
        `INSERT INTO users (username, password, nama, role)
         VALUES ($1, $2, $3, $4)`,
        [username, hashedPassword, nama, 'SUPERADMIN']
      );
      
      console.log('✅ Admin user created successfully with role SUPERADMIN!');
    }

    console.log('\n📝 Login credentials:');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role: SUPERADMIN`);
    console.log('\n⚠️  Please change the default password after first login!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up admin user:', error);
    process.exit(1);
  }
}

setupAdmin();



