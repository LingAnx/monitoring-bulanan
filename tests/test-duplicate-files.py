#!/usr/bin/env python3
"""
test-duplicate-files.py — pastikan tidak ada file duplikat "* 2." di tree,
dan bahwa audit-release.py + build-release.sh memang menolaknya.

Dipanggil manual:  python3 tests/test-duplicate-files.py
Exit code: 0 = semua check lulus, 1 = ada check gagal.
"""
import os, re, subprocess, sys, tempfile, zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
AUDIT = os.path.join(ROOT, "scripts", "audit-release.py")
BUILD = os.path.join(ROOT, "scripts", "build-release.sh")

passed = 0
failed = 0

def ok(msg):
    global passed
    passed += 1
    print(f"  ✅ PASS: {msg}")

def bad(msg):
    global failed
    failed += 1
    print(f"  ❌ FAIL: {msg}")

def check(cond, msg):
    ok(msg) if cond else bad(msg)

print("test-duplicate-files.py")

# 1. Tidak ada file "* 2.*" di source tree (di luar node_modules/public).
DUP = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    # lewati direktori artefak
    dirnames[:] = [d for d in dirnames if d not in ("node_modules", "public", ".git")]
    for fn in filenames:
        # pola duplikat: spasi + angka + titik di dekat akhir basename
        if re.search(r"\s\d+\.[^/]*$", fn):
            DUP.append(os.path.relpath(os.path.join(dirpath, fn), ROOT))
check(len(DUP) == 0, f"tidak ada file duplikat '* 2.*' di source tree (ketemu: {DUP})")

# 2. Canonical build-release.sh ada; duplikat 'build-release 2.sh' TIDAK ada.
canon = os.path.join(ROOT, "scripts", "build-release.sh")
dup2 = os.path.join(ROOT, "scripts", "build-release 2.sh")
check(os.path.isfile(canon), "scripts/build-release.sh (canonical) ada")
check(not os.path.exists(dup2), "scripts/build-release 2.sh (stale duplikat) sudah dihapus")

# 3. audit-release.py menolak file ber-nama "* 2." dalam ZIP.
try:
    td = tempfile.mkdtemp()
    zp = os.path.join(td, "probe_dup.zip")
    with zipfile.ZipFile(zp, "w") as z:
        z.writestr("public/index.html", b"<html>ok</html>")
        z.writestr("scripts/build-release 2.sh", b"#!/usr/bin/env bash\necho stale\n")
    r = subprocess.run([sys.executable, AUDIT, zp], capture_output=True, text=True)
    check(r.returncode == 1, f"audit-release.py menolak file duplikat '* 2.' (exit {r.returncode})")
    check("build-release 2.sh" in r.stdout or "FILE TERLARANG" in r.stdout,
          "audit-release.py mem-flag file duplikat sebagai FILE TERLARANG")
finally:
    import shutil
    shutil.rmtree(td, ignore_errors=True)

# 4. audit-release.py menerima ZIP bersih tanpa file duplikat.
try:
    td = tempfile.mkdtemp()
    zp = os.path.join(td, "clean.zip")
    with zipfile.ZipFile(zp, "w") as z:
        z.writestr("public/index.html", b"<html>ok</html>")
    r = subprocess.run([sys.executable, AUDIT, zp], capture_output=True, text=True)
    check(r.returncode == 0, f"audit-release.py menerima ZIP bersih tanpa duplikat (exit {r.returncode})")
finally:
    import shutil
    shutil.rmtree(td, ignore_errors=True)

# 5. build-release.sh memuat regex penolak file duplikat '* 2.'.
if os.path.isfile(BUILD):
    btxt = open(BUILD).read()
    # File memakai -regex dengan backslash literal (bash single-quote).
    check("\\s[0-9]+" in btxt and "-regex" in btxt,
          "build-release.sh memuat -regex penolak file duplikat '* 2.'")
    check(re.search(r"-o -name '[^']*' \\\n\s+-o -name", btxt, re.S) is not None
          or b"-o -name 'node_modules'" in btxt,
          "build-release.sh predicate direktori terlarang memakai -o (bukan AND)")
else:
    bad("scripts/build-release.sh tidak ada")

# 6. bash -n: build-release.sh sintaks valid.
if os.path.isfile(BUILD):
    r = subprocess.run(["bash", "-n", BUILD], capture_output=True, text=True)
    check(r.returncode == 0, f"bash -n build-release.sh lulus (exit {r.returncode})")
else:
    bad("build-release.sh tidak ada untuk bash -n")

print(f"\n=== RESULT: {passed} passed, {failed} failed, {passed+failed} total ===")
sys.exit(1 if failed else 0)
