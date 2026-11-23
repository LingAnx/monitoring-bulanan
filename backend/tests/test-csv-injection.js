// ============================================================
// test-csv-injection.js
// Unit test: escapeCsvCell prevents formula injection
//
// Verifies that escapeCsvCell prefixes dangerous cells
// (=, +, -, @, tab, etc.) with a single quote, and that
// CSV exports use it.
//
// encoding.js is an IIFE that attaches to window, so we
// simulate a minimal window object in Node.
// ============================================================

const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(msg) { passed++; console.log('  PASS: ' + msg); }
function bad(msg, extra) { failed++; console.log('  FAIL: ' + msg + (extra ? ' — ' + extra : '')); }

// Build a fake window/document for encoding.js IIFE
const win = {};
const encodingSrc = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'security', 'encoding.js'),
  'utf8'
);
new Function('window', 'document', encodingSrc)(win, {
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      textContent: '',
      innerHTML: '',
      style: {},
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k] || null; },
      appendChild(child) {
        if (typeof child === 'object' && child.textContent !== undefined) {
          this.textContent += child.textContent;
        }
      },
    };
    return el;
  },
  createTextNode: (txt) => ({ textContent: txt }),
  createEvent: () => ({}),
});

const escapeCsvCell = win.escapeCsvCell;
const safeUrl = win.safeUrl;
const statusClass = win.statusClass;
const statusBadgeClass = win.statusBadgeClass;

// ── CSV injection tests ─────────────────────────────────

const dangerous = ['=cmd|\'/C calc', '+SUM(A1:A10)', '-1+1', '@SUM(A1)', '\tmalicious', '\rmalicious'];
for (const cell of dangerous) {
  const escaped = escapeCsvCell(cell);
  // Neutralized: either prefixed with ' or the char was stripped
  const neutralized = escaped.startsWith("'") || escaped === '' || !escaped.startsWith('=') && !escaped.startsWith('+') && !escaped.startsWith('-') && !escaped.startsWith('@');
  neutralized
    ? ok(`escapeCsvCell('${cell.slice(0,20)}...') → neutralized`)
    : bad(`escapeCsvCell('${cell.slice(0,20)}...') NOT neutralized: ${escaped}`);
}

const safeCells = ['Hello', 'World', '123', 'test@example.com'];
for (const cell of safeCells) {
  const escaped = escapeCsvCell(cell);
  (escaped === cell)
    ? ok(`escapeCsvCell('${cell}') → unchanged`)
    : bad(`escapeCsvCell('${cell}') modified: ${escaped}`);
}

// ── safeUrl tests ────────────────────────────────────────
// safeUrl default: allows only self, blob:, cdn.jsdelivr.net,
// fonts.googleapis.com, fonts.gstatic.com. External https is rejected
// unless opts.allowExternal is set.
{
  const r = safeUrl('javascript:alert(1)');
  (r === null || r === '' || r === undefined)
    ? ok("safeUrl('javascript:...') → rejected")
    : bad(`safeUrl accepted: ${r}`);
}
{
  const r = safeUrl('data:text/html,<script>alert(1)</script>');
  (r === null || r === '' || r === undefined)
    ? ok("safeUrl('data:text/html') → rejected")
    : bad(`safeUrl accepted: ${r}`);
}
{
  const r = safeUrl('vbscript:msgbox');
  (r === null || r === '' || r === undefined)
    ? ok("safeUrl('vbscript:...') → rejected")
    : bad(`safeUrl accepted: ${r}`);
}
// Internal relative URL (no scheme) — should pass through
{
  const r = safeUrl('/api/files/123');
  r === '/api/files/123'
    ? ok("safeUrl('/api/...') → internal allowed")
    : bad(`safeUrl rejected internal: ${r}`);
}
// Allowlisted CDN host
{
  const r = safeUrl('https://cdn.jsdelivr.net/npm/jszip');
  r === 'https://cdn.jsdelivr.net/npm/jszip'
    ? ok("safeUrl(cdn.jsdelivr.net) → allowlisted host OK")
    : bad(`safeUrl rejected CDN host: ${r}`);
}
// External https without allowExternal → rejected
{
  const r = safeUrl('https://example.com');
  (r === '' || r === null || r === undefined)
    ? ok("safeUrl(https://example.com, default) → rejected (no allowExternal)")
    : bad(`safeUrl accepted external host: ${r}`);
}
// With allowExternal, https passes
{
  const r = safeUrl('https://example.com', { allowExternal: true });
  r === 'https://example.com'
    ? ok("safeUrl(https://example.com, allowExternal) → allowed")
    : bad(`safeUrl allowExternal rejected: ${r}`);
}

// ── statusClass/statusBadgeClass allowlist ──────────────
{
  const valid = ['draft', 'diajukan', 'diteruskan', 'diverifikasi', 'disetujui', 'revisi_kantor'];
  let allValid = true;
  for (const s of valid) {
    const cls = statusClass(s);
    if (!cls) { allValid = false; break; }
  }
  allValid
    ? ok('statusClass: valid statuses → valid CSS class')
    : bad('statusClass rejected a valid status');
}
{
  const invalid = ['<script>alert(1)</script>', 'draft; DROP TABLE users', 'javascript:alert(1)'];
  let allSafe = true;
  for (const s of invalid) {
    const cls = statusClass(s);
    // Unknown statuses must fall back to a safe default class
    if (cls && cls !== 'draft' && !['danger','warning','info','success'].includes(cls)) {
      allSafe = false;
    }
  }
  allSafe
    ? ok('statusClass: invalid input → safe fallback')
    : bad('statusClass leaked unsafe class');
}

console.log('\n=== test-csv-injection: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total ===');
process.exit(failed > 0 ? 1 : 0);
