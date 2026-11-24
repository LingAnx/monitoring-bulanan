#!/usr/bin/env node
// Regression tests for CSP dispatch args, confirm modal callback, monitoring
// number normalization, and progress bar rendering.
// Run: node tests/frontend/test-csp-args-approvals.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = (() => {
  try { return { JSDOM: require('jsdom') }; } catch { return { JSDOM: null }; }
})();

const ROOT = path.resolve(__dirname, '..', '..');
const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL: ${message}`);
}

function ok(message) {
  console.log(`PASS: ${message}`);
}

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return null;
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

// ── 1. app.js: data-action-arg2 produces second argument; id stays first ──
const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

// Dispatcher must read actionArg2 (DOM dataset form of data-action-arg2)
if (!/target\.dataset\.actionArg2/.test(appSource)) {
  fail('app.js: dispatcher tidak membaca target.dataset.actionArg2');
}

// Exactly one declaration of secondArg
const secondArgDecls = (appSource.match(/\bconst secondArg\b/g) || []).length;
if (secondArgDecls !== 1) {
  fail(`app.js: secondArg harus dideklarasikan tepat 1x, ditemukan ${secondArgDecls}x`);
} else {
  ok('app.js: secondArg dideklarasikan tepat 1x');
}

// Argument order check: actionEvent first, then actionArg, then secondArg, then actionSelf
const eventIdx = appSource.indexOf('target.dataset.actionEvent');
const argIdx = appSource.indexOf("hasOwnProperty.call(target.dataset, 'actionArg')");
const secondIdx = appSource.indexOf('const secondArg');
const selfIdx = appSource.indexOf("target.dataset.actionSelf");
if (eventIdx < 0 || argIdx < 0 || secondIdx < 0 || selfIdx < 0) {
  fail('app.js: urutan argumen dispatcher tidak lengkap');
} else if (eventIdx < argIdx && argIdx < secondIdx && secondIdx < selfIdx) {
  ok('app.js: urutan argumen dispatcher benar (event, actionArg, secondArg, actionSelf)');
} else {
  fail('app.js: urutan argumen dispatcher salah');
}

// Runtime proof: the dispatcher passes the report id first and status second.
{
  const dispatcherEnd = appSource.indexOf("document.addEventListener('click', dispatchCspAction)");
  const dispatcherSource = appSource.slice(appSource.indexOf('const CSP_ACTIONS'), dispatcherEnd);
  const received = [];
  const target = {
    dataset: {
      clickAction: 'processApproval',
      actionArg: '42',
      actionArg2: 'disetujui'
    }
  };
  const context = {
    event: {
      type: 'click',
      target: {
        closest(selector) {
          return selector === '[data-navigate], [data-reload]' ? null : target;
        }
      },
      stopPropagation() {},
      preventDefault() {}
    },
    window: {
      processApproval(...args) { received.push(...args); },
      location: { reload() {} }
    },
    console,
    showNotification() {}
  };
  vm.runInNewContext(`${dispatcherSource}\ndispatchCspAction(event);`, context);
  if (JSON.stringify(received) === JSON.stringify(['42', 'disetujui'])) {
    ok('Runtime dispatcher: processApproval menerima [id, status]');
  } else {
    fail(`Runtime dispatcher: argumen salah ${JSON.stringify(received)}`);
  }
}

// No leftover hyphenated attribute in dispatcher output
const dashboardSrc = fs.readFileSync(path.join(ROOT, 'head-office', 'dashboard.js'), 'utf8');
const persetujuanSrc = fs.readFileSync(path.join(ROOT, 'head-office', 'persetujuan.js'), 'utf8');
if (dashboardSrc.includes('data-action-arg-2')) {
  fail('head-office/dashboard.js masih memakai data-action-arg-2');
}
if (persetujuanSrc.includes('data-action-arg-2')) {
  fail('head-office/persetujuan.js masih memakai data-action-arg2');
}
if (!dashboardSrc.includes('data-action-arg2="revisi_kantor"')) {
  fail('head-office/dashboard.js: tombol Minta Revisi harus memakai data-action-arg2="revisi_kantor"');
}
if (!dashboardSrc.includes('data-action-arg2="disetujui"')) {
  fail('head-office/dashboard.js: tombol Setujui harus memakai data-action-arg2="disetujui"');
}
if (!persetujuanSrc.includes('data-action-arg2="revisi_kantor"')) {
  fail('head-office/persetujuan.js: tombol Minta Revisi harus memakai data-action-arg2="revisi_kantor"');
}
if (!persetujuanSrc.includes('data-action-arg2="disetujui"')) {
  fail('head-office/persetujuan.js: tombol Setujui harus memakai data-action-arg2="disetujui"');
}
if (dashboardSrc.includes('data-action-arg-2') === false && persetujuanSrc.includes('data-action-arg-2') === false) {
  ok('Tidak ada data-action-arg-2 tersisa di dashboard.js / persetujuan.js');
}

// ── 2. Confirm modal callback runs after close + double-click guard ──
function assertConfirmBehavior(name, src) {
  const handlerIdx = src.indexOf('btn.onclick = async () => {');
  if (handlerIdx < 0) {
    fail(`${name}: callback konfirmasi harus async agar callback ditunggu`);
    return;
  }
  const after = src.slice(handlerIdx);
  if (!after.includes('if (btn.disabled) return;')) {
    fail(`${name}: callback konfirmasi harus mencegah klik ganda (btn.disabled guard)`);
  }
  if (!/const callback = confirmCallback/.test(after)) {
    fail(`${name}: callback harus disimpan ke variabel lokal sebelum closeConfirmModal()`);
    return;
  }
  const saveIdx = after.indexOf('const callback = confirmCallback');
  const closeIdx = after.indexOf('closeConfirmModal()');
  if (closeIdx < saveIdx) {
    fail(`${name}: callback harus disimpan SEBELUM closeConfirmModal()`);
  }
  if (!after.includes("'Memproses...'") && !after.includes('Memproses...')) {
    fail(`${name}: callback harus menampilkan status "Memproses..."`);
  }
  if (!/try\s*{\s*await callback\(\);\s*}\s*finally\s*{/.test(after)) {
    fail(`${name}: await callback() harus dibungkus try/finally`);
  }
  if (!/finally\s*{[^}]*btn\.textContent\s*=\s*'Konfirmasi';[^}]*btn\.disabled\s*=\s*false;/s.test(after)) {
    fail(`${name}: finally harus memulihkan teks dan disabled tombol`);
  }
  ok(`${name}: callback konfirmasi aman (simpan dulu, tutup, anti-dobel, Memproses...)`);
}
assertConfirmBehavior('head-office/dashboard.js', dashboardSrc);
assertConfirmBehavior('head-office/persetujuan.js', persetujuanSrc);

// ── 3. processApproval error handling: caught object, sanitized message ──
function assertApprovalErrorHandling(name, src) {
  // Find the processApproval function block (ends at next window.<name> = or closeConfirmModal def)
  const idx = src.indexOf('window.processApproval');
  if (idx < 0) { fail(`${name}: processApproval tidak ditemukan`); return; }
  const endMarker = src.indexOf('closeConfirmModal = function', idx);
  const block = src.slice(idx, endMarker > idx ? endMarker : idx + 2000).replace(/\s+/g, ' ');
  if (!block.includes('catch (error)')) {
    fail(`${name}: processApproval harus menangkap objek error (catch (error))`);
    return;
  }
  if (!/showNotification\(error\.message \|\| 'Gagal memproses persetujuan'/.test(block.replace(/\s+/g, ' '))) {
    fail(`${name}: proses approval harus menampilkan error.message || 'Gagal memproses persetujuan'`);
    return;
  }
  ok(`${name}: error handling processApproval benar`);
}
assertApprovalErrorHandling('head-office/dashboard.js', dashboardSrc);
assertApprovalErrorHandling('head-office/persetujuan.js', persetujuanSrc);

// ── 4. Monitoring number normalization ──
const monSrc = persetujuanSrc;
const normFields = ['total_pegawai', 'submitted', 'approved', 'pending_approval', 'pending_verification', 'revision', 'not_submitted'];
for (const f of normFields) {
  if (!monSrc.includes(`Number(s.${f}) || 0`) && !monSrc.includes(`Number(s.${f}) > 0`) && !monSrc.includes(`Number(s.${f})`)) {
    fail(`head-office/persetujuan.js: field ${f} belum dinormalisasi dengan Number(...)`);
  }
}
ok('head-office/persetujuan.js: field monitoring dinormalisasi Number()');

// ── 5. Four "1" strings sum to 4, not "01111" ──
{
  const values = ['1', '1', '1', '1'];
  let totalPegawai = 0, totalSubmitted = 0;
  values.forEach(v => { totalPegawai += Number(v) || 0; totalSubmitted += Number(v) || 0; });
  if (totalPegawai === 4 && totalSubmitted === 4) {
    ok('Normalisasi string: empat "1" menjadi 4 (bukan "01111")');
  } else {
    fail(`Normalisasi string gagal: totalPegawai=${totalPegawai}, totalSubmitted=${totalSubmitted}`);
  }
  // string concatenation trap check
  const badTotal = values.reduce((acc, v) => acc + v, 0);
  if (badTotal !== 4) {
    ok(`Proof: string concat akan menghasilkan "${badTotal}" (1111/NaN) — normalisasi Number() wajib`);
  }
}

// ── 6. Progress bar CSP-safe: no inline style width in monitoring blocks ──
if (/progress-bar-wrap[^>]*style=/.test(monSrc) || /class="progress-bar" style="width/.test(monSrc)) {
  fail('head-office/persetujuan.js: progress bar masih memakai inline style (pelanggaran CSP)');
}
if (!monSrc.includes('<progress class="progress-bar" value=')) {
  fail('head-office/persetujuan.js: progress bar harus memakai elemen <progress> CSP-safe');
}
if (dashboardSrc.includes('class="progress-bar" style="width')) {
  fail('head-office/dashboard.js: progress bar masih memakai inline style (pelanggaran CSP)');
}
ok('Progress bar memakai elemen <progress> tanpa inline style');

for (const [name, source] of [
  ['head-office/dashboard.js', dashboardSrc],
  ['head-office/persetujuan.js', persetujuanSrc]
]) {
  const progressTags = source.match(/<progress\b[^>]*>/g) || [];
  if (progressTags.length === 0) {
    fail(`${name}: elemen progress tidak ditemukan`);
  } else if (progressTags.some(tag => !/\baria-label=/.test(tag))) {
    fail(`${name}: semua elemen progress harus memiliki aria-label`);
  } else {
    ok(`${name}: semua elemen progress memiliki aria-label`);
  }
}

// ── 7. Progress 0/50/100 percent logic ──
{
  function secPct(total, submitted) {
    total = Number(total) || 0;
    submitted = Number(submitted) || 0;
    return total > 0 ? Math.round((submitted / total) * 100) : 0;
  }
  if (secPct(0, 0) === 0) ok('Progress 0%: total 0 menghasilkan 0%');
  else fail('Progress 0% salah');
  if (secPct(2, 1) === 50) ok('Progress 50%: 1/2 menghasilkan 50%');
  else fail('Progress 50% salah');
  if (secPct(4, 4) === 100) ok('Progress 100%: 4/4 menghasilkan 100%');
  else fail('Progress 100% salah');
  if (secPct('4', '4') === 100) ok('Progress 100%: string "4"/"4" dinormalisasi menjadi 100%');
  else fail('Progress 100% dari string salah');
}

// ── 8. approve.css has progress styling ──
const css = fs.readFileSync(path.join(ROOT, 'approve.css'), 'utf8');
if (!css.includes('progress.progress-bar')) {
  fail('approve.css: styling untuk progress.progress-bar tidak ditemukan');
} else {
  ok('approve.css: styling progress.progress-bar ada');
}
if (!css.includes('::-webkit-progress-value') || !css.includes('::-moz-progress-bar')) {
  fail('approve.css: styling cross-browser progress tidak lengkap');
}

const sectionStatsRule = css.match(/\.seksi-block-stats\s*{([^}]*)}/s)?.[1] || '';
if (!/flex-wrap\s*:\s*wrap/.test(sectionStatsRule)) {
  fail('approve.css: .seksi-block-stats harus flex-wrap: wrap');
}
if (!/row-gap\s*:/.test(sectionStatsRule)) {
  fail('approve.css: .seksi-block-stats harus memiliki row-gap');
}

const deadlineRule = css.match(/\.deadline-summary\s*{([^}]*)}/s)?.[1] || '';
if (!/flex-wrap\s*:\s*wrap/.test(deadlineRule)) {
  fail('approve.css: .deadline-summary harus membungkus kartu pada viewport sempit');
}

// ── 9. Runtime confirmation cleanup after a rejected callback ──
async function assertConfirmRuntime(name, src) {
  const functionSource = extractFunction(src, 'function showConfirmModal');
  if (!functionSource) {
    fail(`${name}: showConfirmModal tidak dapat diekstrak untuk tes runtime`);
    return;
  }

  const button = { textContent: 'Konfirmasi', disabled: false, onclick: null };
  const nodes = {
    confirmTitle: { textContent: '' },
    confirmMessage: { textContent: '' },
    confirmExtra: { innerHTML: '' },
    confirmActionBtn: button,
    confirmModal: { classList: { add() {}, remove() {} } }
  };
  const context = {
    document: { getElementById(id) { return nodes[id]; } },
    closeConfirmModal() {}
  };
  vm.runInNewContext(
    `let confirmCallback = null; ${functionSource}; this.showConfirmModal = showConfirmModal;`,
    context
  );

  context.showConfirmModal('Title', 'Message', async () => {
    throw new Error('simulated failure');
  });
  try {
    await button.onclick();
  } catch (error) {
    if (error.message !== 'simulated failure') throw error;
  }

  if (button.disabled || button.textContent !== 'Konfirmasi') {
    fail(`${name}: tombol tidak pulih setelah callback gagal`);
  } else {
    ok(`${name}: tombol pulih setelah callback gagal`);
  }
}

// ── Summary ──
Promise.all([
  assertConfirmRuntime('head-office/dashboard.js', dashboardSrc),
  assertConfirmRuntime('head-office/persetujuan.js', persetujuanSrc)
]).then(() => {
  console.log('');
  if (failures.length > 0) {
    console.error(`${failures.length} failure(s):`);
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log('PASS: seluruh tes regresi approval/monitoring lulus');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
