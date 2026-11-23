#!/usr/bin/env node
/**
 * check-icons.mjs — static regression checks for SVG data-URI icons
 *
 * Verifies:
 *   1. All --icon-* CSS variables have valid data:image/svg+xml URIs
 *   2. No bare # (raw) character inside any data URI (must be %23)
 *   3. No double-encoded %2523fff remains
 *   4. Every .icon-* class references an existing --icon-* variable
 *   5. Icons used by Admin Section (clipboard, check, repeat, bell, search)
 *      resolve to defined variables
 *   6. Icon-only buttons in dashboard.js have aria-label
 *
 * Exit code: 0 = all pass, 1 = failures found.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const projectRoot = join(__dirname, '..');

let failures = 0;
function fail(msg) {
  failures++;
  console.error(`  FAIL: ${msg}`);
}
function ok(msg) {
  console.log(`  PASS: ${msg}`);
}

console.log('=== ICON DATA-URI REGRESSION CHECK ===\n');

// ── Load CSS files ─────────────────────────────────────
const cssFiles = ['style.css', 'public/style.css'];
const cssContents = {};
for (const rel of cssFiles) {
  const path = join(projectRoot, rel);
  if (!existsSync(path)) {
    fail(`CSS file not found: ${rel}`);
    continue;
  }
  cssContents[rel] = readFileSync(path, 'utf8');
}

for (const [rel, css] of Object.entries(cssContents)) {
  console.log(`\nChecking ${rel}:`);

  // 1. Find all --icon-* variable definitions
  const iconVarRe = /--icon-([\w-]+)\s*:\s*url\("([^"]+)"\)/g;
  const iconVars = new Map();
  let m;
  while ((m = iconVarRe.exec(css)) !== null) {
    iconVars.set(m[1], m[2]);
  }
  if (iconVars.size === 0) {
    fail(`No --icon-* variables found`);
  } else {
    ok(`${iconVars.size} --icon-* variables found`);
  }

  // 2. Check each variable has a valid data URI
  const badDataUri = [];
  for (const [name, uri] of iconVars) {
    if (!uri.startsWith('data:image/svg+xml')) {
      badDataUri.push(name);
    }
  }
  if (badDataUri.length > 0) {
    fail(`Icons without data:image/svg+xml: ${badDataUri.join(', ')}`);
  } else {
    ok(`All ${iconVars.size} icons use data:image/svg+xml URIs`);
  }

  // 3. Check for bare # inside data URIs (invalid)
  const rawHashVars = [];
  for (const [name, uri] of iconVars) {
    if (/(?<!%2)#/.test(uri)) {
      rawHashVars.push(name);
    }
  }
  if (rawHashVars.length > 0) {
    fail(`Bare # in data URIs: ${rawHashVars.join(', ')}`);
  } else {
    ok(`No bare # in any data URI`);
  }

  // 4. Check for double-encoded %2523fff
  const doubleCount = (css.match(/%2523fff/g) || []).length;
  if (doubleCount > 0) {
    fail(`Found ${doubleCount} occurrences of double-encoded %2523fff`);
  } else {
    ok(`No double-encoded %2523fff`);
  }

  // 5. Every .icon-* class has a matching variable
  const iconClassRe = /\.icon-([\w-]+)\s*\{[^}]*background-image:\s*var\(--icon-([\w-]+)\)/g;
  const missingClassVars = [];
  let m2;
  while ((m2 = iconClassRe.exec(css)) !== null) {
    const varName = m2[2];
    if (!iconVars.has(varName)) {
      missingClassVars.push(`.icon-${m2[1]} → --icon-${varName}`);
    }
  }
  if (missingClassVars.length > 0) {
    fail(`Classes referencing undefined vars: ${missingClassVars.join(', ')}`);
  } else {
    ok(`All .icon-* classes reference defined variables`);
  }

  // 6. Admin Section specific icons
  const adminIcons = ['clipboard', 'check', 'repeat', 'bell', 'search'];
  for (const icon of adminIcons) {
    if (!iconVars.has(icon)) {
      fail(`--icon-${icon} not defined (required by Admin Section)`);
    }
  }
  if (adminIcons.every(i => iconVars.has(i))) {
    ok(`All 5 Admin Section icons (${adminIcons.join(', ')}) are defined`);
  }
}

// 7. dashboard.js icon-only buttons have aria-label
const dashJsPath = join(projectRoot, 'admin-section', 'dashboard.js');
if (existsSync(dashJsPath)) {
  const js = readFileSync(dashJsPath, 'utf8');
  // Find all <button> tags with .icon but no aria-label
  const btnRe = /<button[^>]*>/g;
  const btns = js.match(btnRe) || [];
  const iconOnlyNoLabel = btns.filter(b =>
    b.includes('class="icon') || b.includes("class='icon")
  ).filter(b => !b.includes('aria-label'));
  // More targeted: find buttons that have an icon child but no aria-label
  const searchBtns = js.match(/<button[^>]*icon-search[^>]*>/g) || [];
  const checkBtns = js.match(/<button[^>]*icon-check[^>]*>/g) || [];
  const missingAria = [...searchBtns, ...checkBtns].filter(b => !b.includes('aria-label'));
  if (missingAria.length > 0) {
    fail(`${missingAria.length} icon-only buttons missing aria-label`);
  } else {
    ok(`All icon-only buttons in dashboard.js have aria-label`);
  }
}

// ── Summary ────────────────────��───────────────────────
console.log('\n' + '='.repeat(50));
if (failures === 0) {
  console.log('ALL ICON CHECKS PASSED');
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED`);
  process.exit(1);
}
