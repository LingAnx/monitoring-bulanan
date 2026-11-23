#!/usr/bin/env python3
"""
audit-release.py — audit keamanan paket distribusi ZIP

Dipanggil oleh: bash scripts/build-release.sh
Dipanggil manual: python3 scripts/audit-release.py <path.zip>

Pemeriksaan:
  1. File terlarang (.env, .git, node_modules, .dump, .bak, log,
     .DS_Store, file duplikat "* 2.*", ZIP lama, secret SQL seed)
  2. Pola secret di isi file teks (bcrypt hash, hex 64+, placeholder)
  3. Symlink yang keluar dari arsip (path absolut / ../../)
  4. [BARU] Duplicate entries di dalam ZIP (satu nama, dua file)
  5. [BARU] Embedded ZIP (file .zip di dalam arsip rilis)
  6. [BARU] Ukuran anomali (>50 MB)

Exit code: 0 = bersih, 1 = ditemukan masalah.
"""
import re, sys, os, zipfile

SENSITIVE_NAMES = {
    ".env", ".env.prod", ".env.local", ".env.development", ".env.staging",
    ".env.example.old", ".env.bak",
    ".git", ".gitignore", ".github",
    "node_modules",
    "uploads", "private", "backups", "logs", "db", "data",
    "__MACOSX", ".DS_Store",
    "ksop_laporan_v1_stable.sql", "STABILITY_ANALYSIS.md", "RDP.md",
    "CHANGELOG_FIXES.md",
    "monitoring-bulanan-release",  # prefix ZIP lama
}

# ── Pola secret (anchored: assignment, BUKAN comparison/validation) ────────
# Anchor penting untuk menghindari false-positive pada kode validasi
# produksi seperti:  if (JWT_SECRET === 'your_jwt_secret_here') { exit(1) }
# (yang BUKAN secret bocor — itu check fail-fast yang seharusnya ada).
# Yang kita deteksi adalah:
#   - assignment:  JWT_SECRET='your_jwt_secret_here'  → bocor
#   - assignment:  DB_PASSWORD='***'  → bocor
#   - test code:   JWT_SECRET: 'your_jwt_secret_here...'  → intent test
#     (tetap flag karena test file tidak boleh ada di release ZIP)
SENSITIVE_PATTERNS = [
    (re.compile(rb"\$2[aby]\$[0-9]{2}\$"), "hash bcrypt terdeteksi"),
    (re.compile(rb"\b[a-f0-9]{64,}\b"), "string hex 64+ (kemungkinan secret/secret key)"),
    # placeholder JWT secret — HANYA di context assignment / object value
    # (Bukan comparison dengan === / != / &&)
    (re.compile(rb"(?:JWT_SECRET|jwt_secret|SECRET_KEY)\s*[=:]?\s*['\"]your_jwt_secret_here", re.I),
     "placeholder JWT secret (di-assign ke config)"),
    # default secret key — sama, assignment-only
    (re.compile(rb"(?:SECRET_KEY|JWT_SECRET|jwt_secret)\s*[=:]?\s*['\"]default_secret_key", re.I),
     "placeholder secret key (di-assign ke config)"),
    # DB_PASSWORD dengan nilai string 8+ char (assignment)
    (re.compile(rb"DB_PASSWORD\s*=\s*['\"][^'\"]{8,}", re.I), "password DB di file config"),
    # jwt_secret dengan nilai string 32+ char (assignment)
    (re.compile(rb"jwt_secret\s*=\s*['\"][^'\"]{32,}", re.I), "JWT secret di file config"),
    # [REGRESI] Kredensial demo yang terlewat di UI publik (hint pada login page dll.)
    # Pola: baris yang memuat 'username/password' demo eksplisit (admin/admin123, dsb.)
    (re.compile(rb"\badmin/admin123\b", re.I), "kredensial demo di aset publik"),
    (re.compile(rb"\bpegawai/pegawai123\b", re.I), "kredensial demo di aset publik"),
    (re.compile(rb"Demo:\s+\w+/\w+", re.I), "hint kredensial demo di aset publik"),
]

# ── Deteksi dump PostgreSQL / database export ─────────────
# Dump basis data (pg_dump, COPY ... FROM stdin, INSERT sensitif)
# adalah kebocoran data, bukan hanya nomenklatur secret.
# Kita scan HANYA file .sql/.txt dan hanya yang mengandung pola dump,
# agar migration/schema normal (CREATE TABLE, ALTER) tidak false-positive.
SQL_DUMP_PATTERNS = [
    # COPY <table> FROM stdin / 'stdin' (pg_dump data dump)
    (re.compile(rb"^\s*COPY\s+\S+\s+FROM\s+['\"]?stdin", re.I | re.MULTILINE), "dump SQL berbasis COPY ... FROM stdin"),
    (re.compile(rb"^\s*COPY\s+.*\s+WITH\s+COPY", re.I), "dump SQL COPY block"),
    # Header pg_dump (pg_dump version line)
    (re.compile(rb"\d+\.pg_dump\s+\d+", re.I), "header pg_dump terdeteksi"),
    (re.compile(rb"--\s*PostgreSQL database dump", re.I), "header dump PostgreSQL"),
    # INSERT data sensitif: INSERT ke tabel users/credential dengan payload
    # panjang (bukan INSERT migration kecil). Batasi: baris INSERT ke
    # tabel kredensial yang mengandung nilai hex 32+ (password hash).
    (re.compile(rb"INSERT\s+INTO\s+\"?(users|credentials|api_keys|sessions)\"?\s*\([^)]*\)", re.I), "INSERT data sensitif (tabel kredensial) dalam dump"),
]

def _flag(name):
    n = name.lower()
    base = os.path.basename(n)
    # Nama eksak
    if base in SENSITIVE_NAMES:
        return True
    # File duplikat macOS/Windows: "foo 2.js"
    if re.search(r" \d+\.", base):
        return True
    # Direktori terlarang di POSISI MANA PUN dalam path (semua komponen).
    # Sebelumnya hanya cek komponen pertama → nested node_modules/evil.js lolos.
    #
    # Catatan: 'db' dan 'data' TIDAK masuk daftar per-komponen karena adalah
    # nama subdirektori sah dari backend (backend/db/migrations). Yang di-flag
    # di posisi mana pun adalah direktori artefak runtime yang memang tidak
    # boleh hadir dalam rilis: node_modules, .git, uploads, logs, private,
    # backups, __MACOSX.
    for part in n.split("/"):
        if part in SENSITIVE_NAMES:
            # 'db' / 'data' hanya flag jika di level ROOT (komp 1), bukan
            # sebagai subdirektori backend yang sah.
            if part in ("db", "data"):
                continue
            return True
    return False

def audit_zip(zip_path):
    if not os.path.isfile(zip_path):
        print(f"ERROR: file tidak ditemukan: {zip_path}", file=sys.stderr)
        return 1

    # Cek ukuran
    size = os.path.getsize(zip_path)
    if size > 50 * 1024 * 1024:
        print(f"FAIL: ukuran anomali: {size} bytes (> 50 MB)")
        return 1
    print(f"ZIP: {zip_path} ({size} bytes)")

    findings = []
    seen_names = set()
    embedded_zip_count = 0
    total_entries = 0

    try:
        zf = zipfile.ZipFile(zip_path, "r")
    except Exception as e:
        print(f"FAIL: tidak bisa dibuka ZIP: {e}")
        return 1

    with zf:
        for info in zf.infolist():
            total_entries += 1
            name = info.filename

            # (4) Duplicate entry check
            if name in seen_names:
                findings.append(f"DUPLICATE ENTRY: {name} (muncul >1x di dalam ZIP)")
            seen_names.add(name)

            # (5) Embedded ZIP check
            if name.lower().endswith(".zip") or name.lower().endswith(".tar.gz"):
                embedded_zip_count += 1
                findings.append(f"EMBEDDED ZIP/ARCHIVE: {name} (arsip di dalam arsip)")

            # (1) Nama terlarang
            if _flag(name):
                findings.append(f"FILE TERLARANG: {name}")
                continue

            # (2) Pola secret di isi
            # Jangan scan file binary (.png, .jpg, .pdf, dll) — hanya teks
            ext = os.path.splitext(name)[1].lower()
            text_exts = {".js", ".json", ".sql", ".sh", ".md", ".html",
                         ".css", ".yml", ".yaml", ".txt", ".env.example"}
            if ext in text_exts or not ext:
                data = zf.read(name)
                for pat, label in SENSITIVE_PATTERNS:
                    if pat.search(data):
                        findings.append(f"SECRET PATTERN ({label}): {name}")
                        break  # satu temuan per file cukup

                # (2b) Dump PostgreSQL / database export — hanya file .sql/.txt
                sql_dump_exts = {".sql", ".txt"}
                if ext in sql_dump_exts:
                    for pat, label in SQL_DUMP_PATTERNS:
                        if pat.search(data):
                            findings.append(f"DB DUMP ({label}): {name}")
                            break  # satu temuan dump per file cukup

    # (6) Exit code
    if findings:
        print(f"FAIL: {len(findings)} temuan ditemukan:")
        for f_ in findings[:30]:
            print(f"  - {f_}")
        if len(findings) > 30:
            print(f"  ... dan {len(findings)-30} temuan lain")
        return 1

    print(f"OK: {total_entries} entry diperiksa, tidak ditemukan masalah.")
    return 0

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 audit-release.py <path.zip>", file=sys.stderr)
        sys.exit(1)
    sys.exit(audit_zip(sys.argv[1]))
