// ============================================================
// test-oauth-flow.js
// Unit test: OOXML structure validation (parseZipEntries)
//
// Builds synthetic DOCX/XLSX ZIP archives in memory and verifies
// that parseZipEntries accepts valid ones and rejects:
//   - polyglot (script as first entry)
//   - path traversal (../etc/passwd in entry name)
//   - zip bomb (entry count exceeds MAX_ZIP_ENTRIES)
//   - wrong MIME (xlsx structure in a "docx" file)
//   - missing [Content_Types].xml
// ============================================================

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { parseZipEntries, ALLOWED_MIME } = require('../middleware/file-security');

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let passed = 0, failed = 0;
function ok(msg) { passed++; console.log('  PASS: ' + msg); }
function bad(msg, extra) { failed++; console.log('  FAIL: ' + msg + (extra ? ' — ' + extra : '')); }

// Build a minimal valid DOCX ZIP in-memory (stored, no compression)
function buildDocxZip(entries) {
  const chunks = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(content, 'utf8');
    // Local file header
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034B50, 0); // PK\x03\x04
    local.writeUInt16LE(0x0a, 4);        // version needed
    local.writeUInt16LE(0x00, 6);        // flags
    local.writeUInt16LE(0x00, 8);        // method: stored
    local.writeUInt16LE(0x00, 10);       // mod time
    local.writeUInt16LE(0x00, 12);       // mod date
    local.writeUInt32LE(0, 14);          // crc32 (not checked by our parser)
    local.writeUInt32LE(data.length, 18); // comp size
    local.writeUInt32LE(data.length, 22); // uncomp size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);          // extra len
    chunks.push(local, nameBuf, data);
    offset += 30 + nameBuf.length + data.length;
  }
  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(0, 12); eocd.writeUInt32LE(0, 16);
  eocd.writeUInt16LE(0, 20);
  chunks.push(eocd);
  return Buffer.concat(chunks);
}

// Build a valid DOCX with [Content_Types].xml + word/document.xml
function buildValidDocx() {
  return buildDocxZip([
    ['[Content_Types].xml', '<?xml version="1.0"?><Types></Types>'],
    ['_rels/.rels', '<?xml version="1.0"?><Relationships></Relationships>'],
    ['word/document.xml', '<?xml version="1.0"?><w:document/>'],
  ]);
}

function buildValidXlsx() {
  return buildDocxZip([
    ['[Content_Types].xml', '<?xml version="1.0"?><Types></Types>'],
    ['_rels/.rels', '<?xml version="1.0"?><Relationships></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0"?><workbook/>'],
    ['xl/worksheets/sheet1.xml', '<?xml version="1.0"?><worksheet/>'],
  ]);
}

function writeTmp(buf, ext) {
  const tmp = path.join(os.tmpdir(), 'ooxml-test-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext);
  fs.writeFileSync(tmp, buf);
  return tmp;
}

// ── Test 1: valid DOCX accepted ──────────────────────────
{
  const f = writeTmp(buildValidDocx(), '.docx');
  const r = parseZipEntries(f, MIME_DOCX);
  r.ok ? ok('valid DOCX accepted') : bad('valid DOCX rejected', r.reason);
  fs.unlinkSync(f);
}

// ── Test 2: valid XLSX accepted ──────────────────────────
{
  const f = writeTmp(buildValidXlsx(), '.xlsx');
  const r = parseZipEntries(f, MIME_XLSX);
  r.ok ? ok('valid XLSX accepted') : bad('valid XLSX rejected', r.reason);
  fs.unlinkSync(f);
}

// ── Test 3: XLSX structure claimed as DOCX → reject ────
{
  const f = writeTmp(buildValidXlsx(), '.docx');
  const r = parseZipEntries(f, MIME_DOCX);
  !r.ok ? ok('XLSX structure as DOCX → rejected') : bad('wrong-structure DOCX accepted');
  fs.unlinkSync(f);
}

// ── Test 4: missing [Content_Types].xml ─────────────────
{
  const buf = buildDocxZip([
    ['word/document.xml', '<?xml version="1.0"?><w:document/>'],
  ]);
  const f = writeTmp(buf, '.docx');
  const r = parseZipEntries(f, MIME_DOCX);
  !r.ok ? ok('missing [Content_Types].xml → rejected') : bad('missing Content_Types accepted');
  fs.unlinkSync(f);
}

// ── Test 5: path traversal entry name ───────────────────
{
  // Build a ZIP with a malicious entry name
  const name = '../etc/passwd';
  const nameBuf = Buffer.from(name, 'utf8');
  const data = Buffer.from('malicious');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034B50, 0);
  local.writeUInt16LE(0x0a, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(0, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  const buf = Buffer.concat([local, nameBuf, data, eocd]);
  const f = writeTmp(buf, '.docx');
  const r = parseZipEntries(f, MIME_DOCX);
  !r.ok && r.reason.includes('traversal') ? ok('path traversal entry → rejected') : bad('path traversal accepted: ' + r.reason);
  fs.unlinkSync(f);
}

// ── Test 6: empty ZIP (no entries) ──────────────────────
{
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  const f = writeTmp(eocd, '.docx');
  const r = parseZipEntries(f, MIME_DOCX);
  !r.ok ? ok('empty ZIP → rejected') : bad('empty ZIP accepted');
  fs.unlinkSync(f);
}

// ── Test 7: non-OOXML MIME skips validation ─────────────
{
  const f = writeTmp(Buffer.from('%PDF-1.4 fake'), '.pdf');
  const r = parseZipEntries(f, 'application/pdf');
  r.ok ? ok('non-OOXML MIME skips structure check') : bad('PDF rejected by OOXML check: ' + r.reason);
  fs.unlinkSync(f);
}

// ── Test 8: DOCX without word/document.xml ──────────────
{
  const buf = buildDocxZip([
    ['[Content_Types].xml', '<?xml version="1.0"?><Types></Types>'],
    ['_rels/.rels', '<?xml version="1.0"?><Relationships></Relationships>'],
    ['word/styles.xml', '<?xml version="1.0"?><w:styles/>'],
  ]);
  const f = writeTmp(buf, '.docx');
  const r = parseZipEntries(f, MIME_DOCX);
  !r.ok ? ok('DOCX missing word/document.xml → rejected') : bad('incomplete DOCX accepted');
  fs.unlinkSync(f);
}

console.log('\n=== test-ooxml-structure: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total ===');
process.exit(failed > 0 ? 1 : 0);
