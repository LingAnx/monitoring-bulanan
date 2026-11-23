#!/usr/bin/env python3
"""
test-audit-zip-fixtures.py — runtime tests untuk audit-release.py

Buat tiga ZIP fixture di /tmp:
  1. clean.zip   — hanya file .js/.html tanpa secret → HARUS PASS (exit 0)
  2. secret.zip  — ada .env berisi JWT_SECRET → HARUS FAIL (exit 1)
  3. dupzip.zip  — entry bernama 'a.js' muncul dua kali → HARUS FAIL (exit 1)

Jalankan dari project root:
  python3 tests/test-audit-zip-fixtures.py
"""
import os, sys, zipfile, tempfile, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIT = os.path.normpath(os.path.join(HERE, "..", "scripts", "audit-release.py"))

passed = 0
failed = 0

def ok(name):
    global passed
    passed += 1
    print(f"  PASS: {name}")

def bad(name, extra=""):
    global failed
    failed += 1
    print(f"  FAIL: {name}" + (f" -- {extra}" if extra else ""))

def make_zip(path, entries):
    """entries: list of (arcname, content_bytes)"""
    with zipfile.ZipFile(path, "w") as z:
        for name, data in entries:
            z.writestr(name, data)

def run_audit(zip_path):
    r = subprocess.run([sys.executable, AUDIT, zip_path],
                       capture_output=True, text=True, timeout=30)
    return r.returncode, r.stdout + r.stderr

# -- Fixture 1: clean.zip ------------------------------------------------
def test_clean_zip():
    with tempfile.TemporaryDirectory() as td:
        zpath = os.path.join(td, "clean.zip")
        make_zip(zpath, [
            ("public/index.html", b"<html><body>test</body></html>"),
            ("backend/server.js", b"const express = require('express');"),
            ("backend/package.json", b'{"name":"test"}'),
        ])
        rc, out = run_audit(zpath)
        if rc == 0:
            ok("clean.zip -> exit 0 (bersih)")
        else:
            bad("clean.zip -> exit 0", f"got {rc}: {out[:300]}")

# -- Fixture 2: secret.zip ------------------------------------------------
def test_secret_zip():
    with tempfile.TemporaryDirectory() as td:
        zpath = os.path.join(td, "secret.zip")
        env_content = (
            b"PORT=3000\n"
            b"JWT_SECRET=" + b"a" * 64 + b"\n"
            b"DB_PASSWORD=supersecretpassword123\n"
        )
        make_zip(zpath, [
            (".env", env_content),
            ("backend/server.js", b"const express = require('express');"),
        ])
        rc, out = run_audit(zpath)
        if rc == 1:
            ok("secret.zip -> exit 1 (.env + secret terdeteksi)")
        else:
            bad("secret.zip -> exit 1", f"got {rc}: {out[:300]}")

# -- Fixture 3: duplicate entry --------------------------------------------
def test_duplicate_zip():
    with tempfile.TemporaryDirectory() as td:
        zpath = os.path.join(td, "dup.zip")
        make_zip(zpath, [
            ("backend/a.js", b"console.log(1);"),
            ("backend/a.js", b"console.log(2);"),
        ])
        rc, out = run_audit(zpath)
        if rc == 1:
            ok("dup.zip -> exit 1 (duplicate entry terdeteksi)")
        else:
            bad("dup.zip -> exit 1", f"got {rc}: {out[:300]}")

# -- Fixture 4: embedded .zip ----------------------------------------------
def test_embedded_zip():
    with tempfile.TemporaryDirectory() as td:
        zpath = os.path.join(td, "outer.zip")
        inner = b"PK\x03\x04" + b"\x00" * 50
        make_zip(zpath, [
            ("backend/a.js", b"console.log(1);"),
            ("nested-archive.zip", inner),
        ])
        rc, out = run_audit(zpath)
        if rc == 1:
            ok("embedded.zip -> exit 1 (embedded archive terdeteksi)")
        else:
            bad("embedded.zip -> exit 1", f"got {rc}: {out[:300]}")

# -- Fixture 5: nested node_modules (audit seluruh komponen path) ----------
def test_nested_node_modules():
    with tempfile.TemporaryDirectory() as td:
        zpath = os.path.join(td, "nested-nm.zip")
        make_zip(zpath, [
            ("public/index.html", b"<html>ok</html>"),
            ("backend/node_modules/evil.js", b"process.env.JWT_SECRET"),
        ])
        rc, out = run_audit(zpath)
        if rc == 1:
            ok("nested-node_modules -> exit 1 (komponen path di posisi 2 terdeteksi)")
        else:
            bad("nested-node_modules -> exit 1", f"got {rc}: {out[:300]}")

# -- Fixture 6: nested .git ------------------------------------------------
def test_nested_dotgit():
    with tempfile.TemporaryDirectory() as td:
        zpath = os.path.join(td, "nested-git.zip")
        make_zip(zpath, [
            ("public/index.html", b"<html>ok</html>"),
            ("backend/.git/config", b"[core]\n"),
        ])
        rc, out = run_audit(zpath)
        if rc == 1:
            ok("nested-.git -> exit 1 (komponen path di posisi 2 terdeteksi)")
        else:
            bad("nested-.git -> exit 1", f"got {rc}: {out[:300]}")

# -- Fixture 7: PostgreSQL COPY ... FROM stdin dump ------------------------
def test_pg_copy_dump():
    with tempfile.TemporaryDirectory() as td:
        zpath = os.path.join(td, "pgdump.zip")
        dump = (
            b"PostgreSQL database dump\n"
            b"2. pg_dump 15.0\n"
            b"\n"
            b"COPY public.laporan (id, status) FROM stdin;\n"
            b"1\tdraft\n"
            b"2\tdiajukan\n"
        )
        make_zip(zpath, [
            ("public/index.html", b"<html>ok</html>"),
            ("backups/db_dump.sql", dump),
        ])
        rc, out = run_audit(zpath)
        if rc == 1:
            ok("pg_copy_dump -> exit 1 (COPY ... FROM stdin + header pg_dump terdeteksi)")
        else:
            bad("pg_copy_dump -> exit 1", f"got {rc}: {out[:300]}")

# -- Fixture 8: migration/schema normal TIDAK boleh false-positive ---------
def test_normal_migration_not_flagged():
    with tempfile.TemporaryDirectory() as td:
        zpath = os.path.join(td, "migration-clean.zip")
        migration = (
            b"-- migration 007: tambah kolom\n"
            b"CREATE TABLE IF NOT EXISTS logs (id SERIAL PRIMARY KEY, msg TEXT);\n"
            b"ALTER TABLE laporan ADD COLUMN IF NOT EXISTS status TEXT;\n"
            b"INSERT INTO config (key, value) VALUES ('version', '2');\n"
        )
        make_zip(zpath, [
            ("public/index.html", b"<html>ok</html>"),
            ("backend/db/migrations/007_add_logs.sql", migration),
        ])
        rc, out = run_audit(zpath)
        if rc == 0:
            ok("normal-migration -> exit 0 (bukan false positive)")
        else:
            bad("normal-migration -> exit 0", f"got {rc}: {out[:300]}")

# -- Fixture 9: forbidden-content injection (defense in depth) -------------
# Jika seseorang menyisipkan file terlarang ke dalam ZIP hasil build,
# audit wajib menolak. Uji beberapa varian:
def test_forbidden_injection():
    variants = [
        ("injected-env.zip",   [(".env", b"JWT_SECRET=a"*32 + b"\n")]),
        ("injected-nm.zip",    [("backend/node_modules/evil.js", b"process.env.X")]),
        ("injected-dump.zip",  [("backups/x.sql", b"COPY t FROM stdin;\n1\td\n")]),
        ("injected-dup.zip",   [("a 2.js", b"console.log(1)")]),
    ]
    for label, entries in variants:
        with tempfile.TemporaryDirectory() as td:
            zpath = os.path.join(td, label)
            make_zip(zpath, entries)
            rc, out = run_audit(zpath)
            if rc == 1:
                ok(f"{label} -> exit 1 (konten terlarang ditolak)")
            else:
                bad(f"{label} -> exit 1", f"got {rc}: {out[:300]}")

# -- Fixture 10: demo credential hint (regression guard) -------------------
def test_demo_credential_hint():
    """
    login.html (public/) TIDAK BOLEH memuat hint kredensial demo.
    Pola yang terdeteksi:  admin/admin123, pegawai/pegawai123, 'Demo: x/y'
    Ini adalah regression guard — fail hard jika hint muncul lagi di rilis.
    """
    with tempfile.TemporaryDirectory() as td:
        zpath = os.path.join(td, "login-hint.zip")
        login_html = (
            b'<html><body><p class="hint">Demo: admin/admin123 | pegawai/pegawai123</p></body></html>'
        )
        make_zip(zpath, [("public/login.html", login_html)])
        rc, out = run_audit(zpath)
        if rc == 1:
            ok("login-hint.zip -> exit 1 (hint kredensial demo terdeteksi)")
        else:
            bad("login-hint.zip -> exit 1 (hint kredensial demo terdeteksi)",
                f"got {rc}: {out[:300]}")

    # Login page tanpa hint → BERSIH
    with tempfile.TemporaryDirectory() as td:
        zpath = os.path.join(td, "login-clean.zip")
        login_html_clean = b'<html><body><form id="loginForm"></form></body></html>'
        make_zip(zpath, [("public/login.html", login_html_clean)])
        rc, out = run_audit(zpath)
        if rc == 0:
            ok("login-clean.zip -> exit 0 (tanpa hint kredensial)")
        else:
            bad("login-clean.zip -> exit 0", f"got {rc}: {out[:300]}")

# -- Run --------------------------------------------------------------------
print("test-audit-zip-fixtures.py")
print(f"  audit script: {AUDIT}")
if not os.path.isfile(AUDIT):
    print(f"  FAIL: {AUDIT} tidak ditemukan")
    sys.exit(1)

test_clean_zip()
test_secret_zip()
test_duplicate_zip()
test_embedded_zip()
test_nested_node_modules()
test_nested_dotgit()
test_pg_copy_dump()
test_normal_migration_not_flagged()
test_forbidden_injection()
test_demo_credential_hint()

print(f"\n=== RESULT: {passed} passed, {failed} failed, {passed+failed} total ===")
sys.exit(1 if failed else 0)
