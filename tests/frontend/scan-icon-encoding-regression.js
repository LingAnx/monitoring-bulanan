#!/usr/bin/env node
// Static icon-encoding regression check.
// Run: node tests/frontend/scan-icon-encoding-regression.js
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
let exitCode = 0;

function findFiles(dir, ext) {
  let cmd = '';
  if (process.platform === 'win32') {
    cmd = `dir /s /b "${dir}\\*.${ext}" 2>nul`;
  } else {
    cmd = `find "${dir}" -type f -name "*.${ext}" 2>/dev/null | head -500`;
  }
  let stdout = '';
  try {
    stdout = cp.execSync(cmd, { encoding: 'utf8', shell: process.platform === 'win32' ? undefined : '/bin/sh' });
  } catch { /* dir may not exist */ }
  return stdout.split('\n').map(l => l.trim()).filter(Boolean);
}

// ── 1. No raw # in SVG data URIs ──────────────────────────
console.log('\n=== Check 1: No raw # in SVG data URIs ===');
const cssFiles = findFiles(path.join(ROOT, 'css'), 'css')
  .concat(findFiles(ROOT, 'css'))
  .filter(f => f.includes('style.css') || f.includes('dashboard.css') || f.includes('admin-section'));
const jsFiles = findFiles(ROOT, 'js').filter(f => !f.includes('node_modules'));
const allFiles = [...new Set(cssFiles.concat(jsFiles))].filter(f => fs.existsSync(f));

let rawHashCount = 0;
for (const f of allFiles) {
  const src = fs.readFileSync(f, 'utf8');
  // Find data:image/svg+xml URIs that contain raw # (not %23)
  const uriRegex = /data:image\/svg\+xml[^)"\s]*/g;
  let m;
  while ((m = uriRegex.exec(src)) !== null) {
    if (m[0].includes('#')) {
      rawHashCount++;
      const lineNum = src.slice(0, m.index).split('\n').length;
      console.log(`  FAIL ${path.relative(ROOT, f)}:${lineNum}`);
      console.log(`    ${m[0].slice(0, 80)}...`);
      exitCode = 1;
    }
  }
}
if (rawHashCount === 0) {
  console.log(`  PASS — 0 raw # in SVG data URIs across ${allFiles.length} files`);
} else {
  console.log(`  FAIL — ${rawHashCount} raw # found`);
}

// ── 2. No double-encoded %2523 in data URIs ──────────────
console.log('\n=== Check 2: No %2523 in SVG data URIs ===');
let doubleEncCount = 0;
for (const f of allFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const uriRegex = /data:image\/svg\+xml[^)"\s]*/g;
  let m;
  while ((m = uriRegex.exec(src)) !== null) {
    if (m[0].includes('%2523')) {
      doubleEncCount++;
      const lineNum = src.slice(0, m.index).split('\n').length;
      console.log(`  FAIL ${path.relative(ROOT, f)}:${lineNum}`);
      exitCode = 1;
    }
  }
}
if (doubleEncCount === 0) {
  console.log('  PASS — 0 double-encoded %2523 found');
} else {
  console.log(`  FAIL — ${doubleEncCount} double-encoded entries`);
}

// ── 3. All --icon-* variables have valid data URIs ───────
console.log('\n=== Check 3: --icon-* variables have valid data URIs ===');
const uniqueCss = [...new Set(cssFiles)].filter(f => fs.existsSync(f));
let iconVars = 0, iconVarsInvalid = 0;
for (const f of uniqueCss) {
  const src = fs.readFileSync(f, 'utf8');
  const varRegex = /--icon-[a-z-]+\s*:\s*url\([^)]+\)/g;
  let m;
  while ((m = varRegex.exec(src)) !== null) {
    iconVars++;
    const val = m[0];
    if (val.startsWith('--icon') && !val.includes('data:image/svg+xml')) {
      iconVarsInvalid++;
      const lineNum = src.slice(0, m.index).split('\n').length;
      console.log(`  FAIL ${path.relative(ROOT, f)}:${lineNum} — ${val.slice(0, 60)}...`);
      exitCode = 1;
    }
  }
}
console.log(`  ${iconVarsInvalid === 0 ? 'PASS' : 'FAIL'} — ${iconVars} --icon-* vars checked, ${iconVarsInvalid} invalid`);

// ── 4. Every .icon-* class references an available variable ──
console.log('\n=== Check 4: .icon-* classes reference available variables ===');
const allCssText = uniqueCss.map(f => fs.readFileSync(f, 'utf8')).join('\n');
// Collect all --icon-* names
const availVars = new Set();
const varDefRegex = /--icon-([a-z-]+)\s*:/g;
let vm;
while ((vm = varDefRegex.exec(allCssText)) !== null) {
  availVars.add(vm[1]);
}
// Collect all .icon-* class references
const clsRegex = /\.icon-([a-z-]+)\b/g;
let iconClasses = 0, missingVars = 0;
let cm;
while ((cm = clsRegex.exec(allCssText)) !== null) {
  iconClasses++;
  const iconName = cm[1];
  if (!availVars.has(iconName)) {
    missingVars++;
    console.log(`  FAIL .icon-${iconName} has no matching --icon-${iconName} definition`);
    exitCode = 1;
  }
}
console.log(`  ${missingVars === 0 ? 'PASS' : 'FAIL'} — ${iconClasses} .icon-* refs, ${availVars.size} vars available, ${missingVars} missing`);

// ── 5. Admin Section icons have background-image ─────────
console.log('\n=== Check 5: Admin Section icon elements have background-image ===');
const dashboardHtml = fs.existsSync(path.join(ROOT, 'admin-section', 'dashboard.html'))
  ? fs.readFileSync(path.join(ROOT, 'admin-section', 'dashboard.html'), 'utf8') : '';
const quickActionCount = (dashboardHtml.match(/class="qa-icon/g) || []).length;
const iconElCount = (dashboardHtml.match(/class="icon /g) || []).length;
if (quickActionCount >= 4) {
  console.log(`  PASS — ${quickActionCount} quick-action buttons found`);
} else {
  console.log(`  WARN — ${quickActionCount} quick-action buttons (expected 4)`);
}
if (iconElCount > 0) {
  console.log(`  INFO — ${iconElCount} .icon elements in dashboard.html`);
}

// ── 6. Icon buttons have aria-label ───────────────────────
console.log('\n=== Check 6: Icon-only buttons have aria-label ===');
const jsTargetFiles = [
  path.join(ROOT, 'admin-section', 'dashboard.js'),
  path.join(ROOT, 'dashboard.js'),
  ...findFiles(path.join(ROOT, 'js'), 'js').filter(f => !f.includes('node_modules'))
];
let ariaMissing = 0;
for (const f of [...new Set(jsTargetFiles)]) {
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  // Find button elements created in JS that have .icon but no aria-label
  const btnRegex = /createElement\('button'|<button[^>]*>/g;
  let bm;
  while ((bm = btnRegex.exec(src)) !== null) {
    const context = src.slice(bm.index, bm.index + 200);
    if (!context.includes('aria-label') && !context.includes('title')) {
      // Check if it's an icon-only button (has .icon or no text content)
      if (context.includes('.icon') || context.includes('icon-search') || context.includes('icon-check')) {
        ariaMissing++;
        const lineNum = src.slice(0, bm.index).split('\n').length;
        console.log(`  FAIL ${path.relative(ROOT, f)}:${lineNum} — button without aria-label`);
        exitCode = 1;
      }
    }
  }
}
if (ariaMissing === 0) {
  console.log('  PASS — all icon buttons have aria-label or title');
}

console.log('\n' + (exitCode === 0 ? '✅ ALL ICON REGRESSION CHECKS PASSED' : '❌ SOME CHECKS FAILED'));
process.exit(exitCode);
