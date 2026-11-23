// ══════════════════════════════════════════════════
// MIGRATION RUNNER — backend/scripts/migrate.js
//
// Runs SQL migration files from backend/db/migrations/ in order.
// Tracks applied migrations in the schema_migrations table.
// Idempotent: already-applied migrations are skipped.
//
// Usage:
//   npm run db:migrate           # run all pending migrations
//   npm run db:migrate -- list  # list migrations and their status
//   npm run db:migrate -- reset  # DROP schema_migrations and rerun all (DANGEROUS)
// ══════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const pool = require('../db/database');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

// Only track .sql files — .js files in migrations/ are one-off legacy scripts
const SQL_EXTENSIONS = ['.sql'];

function log(msg) {
  console.log(`[migrate] ${msg}`);
}

function fail(msg) {
  console.error(`[migrate] ERROR: ${msg}`);
  process.exit(1);
}

// ── Ensure schema_migrations table exists ──────────────────
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ── List .sql migration files sorted by name ───────────────
function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    log(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    return [];
  }
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => SQL_EXTENSIONS.some(ext => f.endsWith(ext)))
    .sort();
}

// ── Get set of already-applied migrations ──────────────────
async function getApplied(client) {
  const res = await client.query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return new Set(res.rows.map(r => r.filename));
}

// ── Run a single .sql file inside a transaction ────────────
async function applyMigration(client, filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, 'utf8');

  log(`Applying ${filename} ...`);
  await client.query('BEGIN');
  try {
    // Split on semicolons is unreliable for functions/triggers,
    // so execute the whole file as one statement batch.
    // pg supports multi-statement strings in a single query call
    // when run on a client (not pool.query for data queries).
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1)',
      [filename]
    );
    await client.query('COMMIT');
    log(`  ✔ ${filename} applied successfully`);
  } catch (err) {
    await client.query('ROLLBACK');
    fail(`Migration ${filename} FAILED:\n${err.message}\n\nRolled back.`);
  }
}

// ── Command: list ────────────────────────────────────────────
async function listMigrations() {
  const files = listMigrationFiles();
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);

    if (files.length === 0) {
      log('No .sql migration files found.');
      return;
    }

    console.log('\nMigration status:');
    console.log('─'.repeat(55));
    for (const f of files) {
      const status = applied.has(f) ? 'APPLIED' : 'PENDING';
      console.log(`  [${status.padEnd(7)}] ${f}`);
    }
    console.log('─'.repeat(55));
    const pending = files.filter(f => !applied.has(f));
    console.log(`${pending.length} pending, ${files.length - pending.length} applied.\n`);
  } finally {
    client.release();
  }
}

// ── Command: run (default) ──────────────────────────────────
async function runMigrations() {
  const files = listMigrationFiles();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);

    const pending = files.filter(f => !applied.has(f));

    if (pending.length === 0) {
      log('All migrations already applied. Nothing to do.');
      return;
    }

    log(`${pending.length} migration(s) pending.`);
    for (const f of pending) {
      await applyMigration(client, f);
    }
    log(`All migrations applied. Total: ${files.length}`);
  } finally {
    client.release();
  }
}

// ── Command: reset (dangerous) ──────────────────────────────
async function resetMigrations() {
  const client = await pool.connect();
  try {
    log('⚠️  Resetting schema_migrations table. All migrations will be re-applied.');
    const confirm = process.env.CONFIRM_RESET;
    if (confirm !== 'yes') {
      fail('REFUSED: set CONFIRM_RESET=yes to confirm reset.\n' +
           'Example: CONFIRM_RESET=yes npm run db:migrate -- reset');
    }
    await client.query('DROP TABLE IF EXISTS schema_migrations');
    log('schema_migrations dropped. Re-running all migrations...');
    await client.release();

    // Re-run all migrations from scratch
    await runMigrations();
  } catch (err) {
    client.release();
    if (err.code !== undefined) fail(err.message);
    else throw err;
  }
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  const command = process.argv[2] || 'run';

  switch (command) {
    case 'list':
      await listMigrations();
      break;
    case 'reset':
      await resetMigrations();
      break;
    case 'run':
    default:
      await runMigrations();
      break;
  }

  await pool.end();
}

main().catch(err => {
  fail(err.message || String(err));
});
