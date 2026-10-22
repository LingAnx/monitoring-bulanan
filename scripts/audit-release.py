#!/usr/bin/env python3
"""Audit paket rilis monitoring-bulanan: extrak + cek file terlarang, pola secret, data pribadi."""
import zipfile, os, re, sys, glob

PROJECT = os.path.dirname(os.path.abspath('.'))
# Cari ZIP release terbaru
zips = sorted(glob.glob('monitoring-bulanan-release-*.zip'), reverse=True)
if not zips:
    print("GAGAL: tidak ada ZIP release ditemukan.", file=sys.stderr)
    sys.exit(1)
zip_path = zips[0]
print(f"Auditing: {zip_path}")

z = zipfile.ZipFile(zip_path)
names = z.namelist()
print(f"\nTotal files in ZIP: {len(names)}")

# ── Forbidden file names/dirs ──
forbidden_names = {'.env','.env.prod','.env.local','.env.development','.env.staging',
                   '.DS_Store','__MACOSX','STABILITY_ANALYSIS.md','RDP.md','CHANGELOG_FIXES.md',
                   'ksop_laporan_v1_stable.sql'}
forbidden_exts = ('.dump','.backup','.bak','.sql.gz','.log')
forbidden_dirs  = {'node_modules','uploads','logs','private','.git','backups'}

problems = []
for n in names:
    base = os.path.basename(n)
    parts = n.split('/')[:-1]
    if base in forbidden_names:
        problems.append(f"FILE TERLARANG: {n}")
    for ext in forbidden_exts:
        if base.endswith(ext):
            problems.append(f"FILE TERLARANG ({ext}): {n}")
    for d in forbidden_dirs:
        if d in parts:
            problems.append(f"DIR TERLARANG: {n}")
    if '..' in n.split('/'):
        problems.append(f"PATH TRAVERSAL: {n}")

print(f"\n--- Forbidden file/directory check ---")
if problems:
    for p in problems: print(f"  ❌ {p}")
else:
    print(f"  ✅ Tidak ada file/dir terlarang, path traversal.")

# Symlink check
sym_count = 0
for info in z.infolist():
    mode = (info.external_attr >> 16) & 0o170000
    if mode == 0o120000:
        sym_count += 1
        print(f"  ⚠️  SYMLINK: {info.filename}")
if sym_count == 0:
    print(f"  ✅ Tidak ada symlink.")

# ── Content pattern check ──
bcrypt_pat  = re.compile(rb'\$2[aby]\$[0-9]{2}\$')
nip_pat     = re.compile(rb'19[78]\d{10}')
hex64_pat   = re.compile(rb"['\"]([a-f0-9]{64,})['\"]")

print(f"\n--- Content pattern check ---")
content_issues = []
for info in z.infolist():
    fn = info.filename
    if info.file_size == 0 or fn.endswith(('.png','.jpg','.pdf','.gif','.zip','.lock')):
        continue
    try: data = z.read(fn)
    except: continue

    if bcrypt_pat.search(data):
        content_issues.append(f"HASH BCRYPT TERDETEKSI: {fn}")
    if nip_pat.search(data):
        # NIP test (fiktif) hanya ada di setup-seed.js — acceptable untuk dev seed
        # Flag hanya jika NIP ditemukan di file selain seed
        if fn != 'backend/scripts/setup-seed.js':
            matches = nip_pat.findall(data)
            content_issues.append(f"NIP PATTERN TERDETEKSI (non-seed): {fn} ({len(matches)} match)")

    if fn.endswith('.js'):
        for m in hex64_pat.finditer(data):
            ctx = data[max(0,m.start()-60):m.end()+60].decode('utf-8','replace')
            if 'randomBytes' not in ctx and 'your_' not in ctx and 'old_secret' not in ctx and 'new_secret' not in ctx:
                content_issues.append(f"HEX SECRET 64+ TERDETEKSI: {fn}")
                break

if content_issues:
    for c in content_issues: print(f"  ❌ {c}")
else:
    print(f"  ✅ Tidak ada hash bcrypt, pola NIP, atau hex secret di file teks.")

# ── Required file check ──
print(f"\n--- Required file check ---")
required = [
    'public/index.html',
    'public/login.html',
    'public/style.css',
    'public/js/auth/auth-store.js',
    'public/employee/dashboard.html',
    'public/admin-section/dashboard.html',
    'public/head-office/dashboard.html',
    'public/superadmin/dashboard.html',
    'backend/package.json',
    'backend/package-lock.json',
    'backend/server.js',
    'backend/.env.example',
    'backend/db/schema.sql',
    'backend/tests/test-jwt-rotation.js',
    'backend/db/migrations/005_add_must_change_password.sql',
    'backend/docs/db-credentials.md',
    'backend/scripts/security-check.js',
]
all_ok = True
for req in required:
    found = req in names
    if not found: all_ok = False
    print(f"  {'✅' if found else '❌'} {req}")

# ── Size ──
size = os.path.getsize(zip_path)
print(f"\n--- Package size ---")
print(f"  ZIP: {size} bytes ({size//1024} KB) — {len(names)} file")
