#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'public', '.release-quarantine']);
const inlinePattern = /\s(?:onclick|onchange|onsubmit|onerror|onload)\s*=/i;
const actionPattern = /data-(?:click|change|submit)-action="([^"]+)"/g;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const htmlFiles = walk(ROOT);
const jsFiles = [];

function walkJs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(full);
    else if (entry.name.endsWith('.js')) jsFiles.push(full);
  }
}
for (const name of ['admin-section', 'employee', 'head-office', 'superadmin', 'js']) {
  walkJs(path.join(ROOT, name));
}
for (const name of fs.readdirSync(ROOT)) {
  if (name.endsWith('.js')) jsFiles.push(path.join(ROOT, name));
}
const failures = [];
let actionCount = 0;

for (const file of htmlFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (inlinePattern.test(source)) {
    failures.push(`${path.relative(ROOT, file)} masih memiliki inline event handler`);
  }

  let match;
  while ((match = actionPattern.exec(source)) !== null) {
    actionCount++;
    const action = match[1];
    if (!appSource.includes(`'${action}'`)) {
      failures.push(`${path.relative(ROOT, file)} memakai action tanpa allowlist: ${action}`);
    }
  }

  if (source.includes('data-click-action=') || source.includes('data-change-action=') || source.includes('data-submit-action=')) {
    if (!source.includes('src="/app.js"')) {
      failures.push(`${path.relative(ROOT, file)} memakai CSP action tanpa memuat /app.js`);
    }
  }
}

for (const file of jsFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (inlinePattern.test(source)) {
    failures.push(`${path.relative(ROOT, file)} membangun inline event handler di JavaScript`);
  }
  let match;
  while ((match = actionPattern.exec(source)) !== null) {
    actionCount++;
    const action = match[1];
    if (!appSource.includes(`'${action}'`)) {
      failures.push(`${path.relative(ROOT, file)} memakai action tanpa allowlist: ${action}`);
    }
  }
}

const dashboardJs = fs.readFileSync(path.join(ROOT, 'admin-section', 'dashboard.js'), 'utf8');
if (dashboardJs.includes('showDetailModal(')) {
  failures.push('admin-section/dashboard.js masih memanggil showDetailModal yang tidak tersedia');
}

const laporanJs = fs.readFileSync(path.join(ROOT, 'admin-section', 'laporan.js'), 'utf8');
const bindIndex = laporanJs.indexOf('setupLaporanActions();');
const detailBranchIndex = laporanJs.indexOf('if (laporanId)');
if (bindIndex < 0 || detailBranchIndex < 0 || bindIndex > detailBranchIndex) {
  failures.push('listener laporan harus dipasang sebelum alur detail ?id= melakukan early return');
}

if (failures.length > 0) {
  failures.forEach(message => console.error(`FAIL: ${message}`));
  process.exit(1);
}

console.log(`PASS: ${htmlFiles.length} HTML + ${jsFiles.length} JS, ${actionCount} CSP-safe actions, 0 inline handlers`);
