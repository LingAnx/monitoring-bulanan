// Test: kolom kanonik audit_trail = `detail` di seluruh source
// Jalankan dari backend/: node tests/test-audit-column.js
//
// Klaim yang diverifikasi:
//  1. Tidak ada baris SQL (non-comment) yang menyebut
//     `audit_trail` + `details` (nama lama/salah).
//  2. schema.sql memakai `detail TEXT`.
//  3. Migration 008 (jika ada) tidak melakukan rename
//     `detail` → `details`.
//  4. INSERT INTO audit_trail di route memakai `detail`.

'use strict';
const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..');
const ROUTES = path.join(BACKEND_DIR, 'routes');
const MIDDLEWARE = path.join(BACKEND_DIR, 'middleware');
const SCHEMA = path.join(BACKEND_DIR, 'db', 'schema.sql');
const MIG_008 = path.join(BACKEND_DIR, 'db', 'migrations', '008_repair_audit_trail_details.sql');

let passed = 0, failed = 0;
function ok(name) { passed++; console.log('  ✅ PASS: ' + name); }
function bad(name, extra) { failed++; console.log('  ❌ FAIL: ' + name + (extra ? ' — ' + extra : '')); }
function assert(cond, name, extra) { cond ? ok(name) : bad(name, extra); }

function scanJsDir(dir, label) {
  const offenders = [];
  if (!fs.existsSync(dir)) return offenders;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    src.split('\n').forEach((line, i) => {
      const stripped = line.trim();
      if (!stripped.includes('audit_trail')) return;
      if (stripped.startsWith('//') || stripped.startsWith('*') || stripped.startsWith('--')) return;
      // Cari `details` (plural) di context audit_trail
      if (/\baudit_trail\b.*\bdetails\b/.test(line)) {
        offenders.push(`${f}:${i + 1}: ${stripped.slice(0, 120)}`);
      }
    });
  }
  assert(offenders.length === 0, `${label}: tidak ada 'details' di query audit_trail`,
    offenders.slice(0, 5).join('\n    '));
  return offenders;
}

console.log('test-audit-column.js');

// (1) + (4): scan routes dan middleware
scanJsDir(ROUTES, 'routes');
scanJsDir(MIDDLEWARE, 'middleware');

// (2) schema.sql memakai `detail`
const schemaSrc = fs.readFileSync(SCHEMA, 'utf8');
const schemaLines = schemaSrc.split('\n');
const auditBlock = schemaLines.slice(
  schemaLines.findIndex(l => l.includes('CREATE TABLE IF NOT EXISTS audit_trail')),
  schemaLines.findIndex(l => l.includes('CREATE TABLE IF NOT EXISTS audit_trail')) + 15
).join('\n');
assert(/\bdetail\s+TEXT\b/.test(auditBlock), 'schema.sql: kolom `detail TEXT` ada di tabel audit_trail',
  auditBlock.slice(0, 200));
assert(!/\bdetails\s+TEXT\b/.test(auditBlock), 'schema.sql: kolom `details` TIDAK ada di tabel audit_trail');

// (3) Migration 008 tidak melakukan rename detail → details
if (fs.existsSync(MIG_008)) {
  const migSrc = fs.readFileSync(MIG_008, 'utf8');
  assert(!/RENAME\s+COLUMN\s+detail\s+TO\s+details/i.test(migSrc),
    'migration 008: tidak ada rename detail → details');
} else {
  console.log('  ⚠️  migration 008 tidak ditemukan (dilalui)');
}

console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total ===');
process.exit(failed > 0 ? 1 : 0);
