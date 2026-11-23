// Test: seluruh query audit_trail di source memakai kolom kanonik `detail`
// (bukan `details`). Jalankan dari backend/: node tests/test-audit-schema.js
//
// Strategi: scan seluruh file .js di routes/ dan middleware/ untuk
// pola SQL yang menyebut audit_trail + nama kolom, lalu klaim
// hanya `detail` (tanpa akhiran s) yang boleh muncul di context SQL.

'use strict';
const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', 'routes');
const MIDDLEWARE_DIR = path.join(__dirname, '..', 'middleware');

let passed = 0, failed = 0;
function ok(name) { passed++; console.log('  ✅ PASS: ' + name); }
function bad(name, extra) { failed++; console.log('  ❌ FAIL: ' + name + (extra ? ' — ' + extra : '')); }
function assert(cond, name, extra) { cond ? ok(name) : bad(name, extra); }

// Pola yang DILARANG di context SQL (kolom `details` setelah
// kata `action` atau di daftar kolom audit_trail).
// Catatan: `details` boleh muncul di comment atau string lain
// yang bukan SQL — kita hanya cek baris yang mengandung
// 'audit_trail'.
const forbiddenRe = /\baudit_trail\b[^\n]*\bdetails\b/;

function scanDir(dir, label) {
  const offenders = [];
  if (!fs.existsSync(dir)) return offenders;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      // Hanya baris yang menyebut audit_trail
      if (!line.includes('audit_trail')) return;
      // Baris comment-only dilewati
      const stripped = line.trim();
      if (stripped.startsWith('//') || stripped.startsWith('*')) return;
      if (forbiddenRe.test(line)) {
        offenders.push(`${f}:${i + 1}: ${stripped.slice(0, 100)}`);
      }
    });
  }
  assert(offenders.length === 0, `${label}: tidak ada 'details' di query audit_trail`,
    offenders.slice(0, 3).join('\n    '));
  return offenders;
}

console.log('test-audit-schema.js');
scanDir(ROUTES_DIR, 'routes');
scanDir(MIDDLEWARE_DIR, 'middleware');

// Juga cek schema.sql memakai `detail`
const schemaSrc = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
assert(/\bdetail\b/.test(schemaSrc) && !/audit_trail\s*\([^)]*\bdetails\b/.test(schemaSrc),
  'schema.sql: kolom kanonik = detail',
  'audit_trail table definition masih memakai details');

// Cek migration 008 target = detail
const migFile = path.join(__dirname, '..', 'db', 'migrations', '008_repair_audit_trail_details.sql');
if (fs.existsSync(migFile)) {
  const migSrc = fs.readFileSync(migFile, 'utf8');
  assert(!/ALTER TABLE audit_trail RENAME COLUMN detail TO details/.test(migSrc),
    'migration 008: tidak ada rename detail → details',
    'migration masih mengarah ke details');
}

console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total ===');
process.exit(failed > 0 ? 1 : 0);
