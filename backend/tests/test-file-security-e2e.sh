#!/usr/bin/env bash
# test-file-security-e2e.sh
# E2E test keamanan lampiran — skenario 1, 2, 3, 18, 19
# Butuh: PostgreSQL running + JWT_SECRET valid + DB berisi test fixtures
#
# Cara menjalankan:
#   DB_HOST=... DB_PORT=5432 DB_NAME=ksop_test DB_USER=... DB_PASSWORD=... \
#   JWT_SECRET=$(openssl rand -hex 32) \
#   bash backend/tests/test-file-security-e2e.sh
set -uo pipefail

: "${DB_HOST:?DB_HOST wajib}"
: "${DB_PORT:5432}"
: "${DB_NAME:?=DB_NAME wajib}"
: "${DB_USER:?DB_USER wajib}"
: "${DB_PASSWORD:-}"
: "${JWT_SECRET:?JWT_SECRET wajib (min 32 char)}"

BACKEND="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${BACKEND}"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✅ PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ❌ FAIL: $1 — $2"; }

# ── Setup DB test ──
PSQL="env PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -t -A"

# Buat seksi + 2 pegawai + 1 admin seksi + 1 kepala + laporan
$PSQL -qc "INSERT INTO seksi(id,nama_seksi) VALUES (9001,'Seksi Uji A'),(9002,'Seksi Uji B') ON CONFLICT(id) DO NOTHING;"
$PSQL -qc "
INSERT INTO users(id, username, password, nama, id_seksi, role, is_active)
VALUES
 (9001,'emp_a','x','Pegawai A',9001,'PEGAWAI',true),
 (9002,'emp_b','x','Pegawai B',9002,'PEGAWAI',true),
 (9003,'admin_a','x','Admin A',9001,'ADMIN_SEKSI',true),
 (9004,'kepala','x','Kepala Kantor',NULL,'KEPALA_KANTOR',true)
ON CONFLICT(id) DO NOTHING;"
# Buat laporan dengan status 'draft' agar upload report_id=9001 berhasil
# judul wajib diisi (NOT NULL constraint)
$PSQL -qc "
INSERT INTO laporan(id, id_user, judul, bulan, tahun, status)
VALUES (9001,9001,'Laporan Uji A',1,2026,'draft'), (9002,9002,'Laporan Uji B',1,2026,'draft')
ON CONFLICT(id) DO UPDATE SET status='draft';"
echo "DB seeded: $( $PSQL -c "SELECT COUNT(*) FROM users WHERE id IN (9001,9002,9003,9004);" ) users, $( $PSQL -c "SELECT COUNT(*) FROM laporan WHERE id IN (9001,9002);" ) laporan"

# Jalankan server di port test
export JWT_SECRET NODE_ENV=development DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD PORT=4455
node server.js &
SRV_PID=$!
sleep 3

cleanup() {
  kill $SRV_PID 2>/dev/null || true
  $PSQL -qc "DELETE FROM files WHERE owner_user_id IN (9001,9002,9003,9004);" 2>/dev/null
  $PSQL -qc "DELETE FROM laporan WHERE id IN (9001,9002);" 2>/dev/null
  $PSQL -qc "DELETE FROM users WHERE id IN (9001,9002,9003,9004);" 2>/dev/null
  $PSQL -qc "DELETE FROM seksi WHERE id IN (9001,9002);" 2>/dev/null
}
trap cleanup EXIT

BASE="http://127.0.0.1:4455"

# Login → token per user
login() {
  curl -s -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}

# Token (password test 'x' tidak akan cocok dengan bcrypt hash 'x' di atas)
# Kita buat user dengan password yang bisa login: gunakan setup approach via SQL
# karena kita tidak ingin memproses bcrypt di sini. Buat user khusus dengan
# hash sederhana yang dibuat Node, lalu login.
# Ganti user test dengan hash bcrypt yang valid:
HASH_A=$(node -e "console.log(require('bcrypt').hashSync('pw_a_test',4))")
$PSQL -qc "UPDATE users SET password='$HASH_A' WHERE id=9001;" 2>/dev/null
$PSQL -qc "UPDATE users SET password='$HASH_A' WHERE id=9002;" 2>/dev/null
$PSQL -qc "UPDATE users SET password='$HASH_A' WHERE id=9003;" 2>/dev/null
$PSQL -qc "UPDATE users SET password='$HASH_A' WHERE id=9004;" 2>/dev/null

# Login pegawai A
TOKEN_A=$(login emp_a pw_a_test)
TOKEN_B=$(login emp_b pw_a_test)
TOKEN_ADMIN_A=$(login admin_a pw_a_test)
TOKEN_KP=$(login kepala pw_a_test)

# ── Skenario 1: upload tanpa token → 401 ──
S=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" -F "file=@tests/fixtures/test.pdf")
[[ "$S" == "401" ]] && ok "upload tanpa token → 401" || bad "upload tanpa token" "status=$S"

# ── Skenario 2: download tanpa token → 401 ──
S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/files/00000000-0000-0000-0000-000000000000")
[[ "$S" == "401" ]] && ok "download tanpa token → 401" || bad "download tanpa token" "status=$S"

# ── Upload PDF valid sebagai pegawai A (report 9001) ──
RESP=$(curl -s -X POST "$BASE/api/upload?report_id=9001" \
  -H "Authorization: Bearer $TOKEN_A" \
  -F "file=@tests/fixtures/test.pdf;filename=laporan_uji.pdf")
FILE_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null)
[[ -n "$FILE_ID" ]] && ok "upload PDF valid (pegawai A) → id=${FILE_ID:0:8}…" || bad "upload PDF valid" "$RESP"

# ── Skenario 3: pegawai B akses file pegawai A → 403/404 ──
S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/files/$FILE_ID" -H "Authorization: Bearer $TOKEN_B")
[[ "$S" == "403" || "$S" == "404" ]] && ok "pegawai B akses file A → $S" || bad "lintas-user" "status=$S"

# Admin seksi A akses file pegawai A (seksi sama) → 200
S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/files/$FILE_ID" -H "Authorization: Bearer $TOKEN_ADMIN_A")
[[ "$S" == "200" ]] && ok "admin seksi A akses file A (seksi sama) → 200" || bad "admin seksi A" "status=$S"

# ── Skenario 8: HTML bernama .pdf → 415 ──
printf '<html><script>evil()</script></html>' > /tmp/fake.pdf
S=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" \
  -H "Authorization: Bearer $TOKEN_A" \
  -F "file=@/tmp/fake.pdf;filename=fake.pdf")
[[ "$S" == "415" ]] && ok "HTML bernama .pdf → 415" || bad "HTML bernama .pdf" "status=$S"

# ── Skenario 10: SVG aktif → 415 ──
printf '<svg><script>evil()</script></svg>' > /tmp/active.svg
S=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/upload" \
  -H "Authorization: Bearer $TOKEN_A" \
  -F "file=@/tmp/active.svg;filename=pic.svg")
[[ "$S" == "415" ]] && ok "SVG aktif → 415" || bad "SVG aktif" "status=$S"

# ── Skenario 18: endpoint lama /uploads/... → 403/404 ──
S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/uploads/$FILE_ID")
[[ "$S" == "403" || "$S" == "404" ]] && ok "endpoint lama /uploads → $S" || bad "endpoint lama /uploads" "status=$S"

# ── Skenario 19: response download header ──
HDRS=$(curl -s -D - -o /dev/null "$BASE/api/files/$FILE_ID" -H "Authorization: Bearer $TOKEN_A")
echo "$HDRS" | grep -qi 'X-Content-Type-Options: nosniff' && ok "header nosniff ada" || bad "header nosniff" "missing"
echo "$HDRS" | grep -qi 'Content-Disposition: attachment' && ok "header attachment ada" || bad "header attachment" "missing"
echo "$HDRS" | grep -qi 'Cache-Control: private, no-store' && ok "header no-store ada" || bad "header no-store" "missing"

# ── Hapus file uji ──
S=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/upload/$FILE_ID" -H "Authorization: Bearer $TOKEN_A")
[[ "$S" == "200" ]] && ok "hapus file (pemilik) → 200" || bad "hapus file" "status=$S"

rm -f /tmp/fake.pdf /tmp/active.svg

echo ""
echo "=== E2E RESULT: $PASS passed, $FAIL failed, $((PASS+FAIL)) total ==="
[[ $FAIL -gt 0 ]] && exit 1 || exit 0
