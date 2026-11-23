#!/usr/bin/env bash
# test-auth-workflow-e2e.sh
# E2E test Tahap 6 — autentikasi, otorisasi role, kepemilikan data, integritas workflow
# Butuh: PostgreSQL running + JWT_SECRET valid
#
# Cara menjalankan:
#   DB_HOST=... DB_PORT=5432 DB_NAME=ksop_test DB_USER=... DB_PASSWORD=... \
#   JWT_SECRET=$(openssl rand -hex 32) \
#   bash backend/tests/test-auth-workflow-e2e.sh
#
# Perilaku:
#   - set -uo pipefail (bukan -e): setiap perintah penting dicek dengan guard
#     eksplisit agar satu assert gagal tidak menghentikan sisa test suite.
#   - Server cleanup di trap EXIT (mencakup juga INT/TERM).
#   - Fixtures pakai run-id unik agar aman di DB shared (hapus hanya data
#     milik run ini, jangan ON CONFLICT DO NOTHING yang tidak cleanup).
set -uo pipefail

: "${DB_HOST:?DB_HOST wajib}"
: "${DB_PORT:5432}"
: "${DB_NAME:?=DB_NAME wajib}"
: "${DB_USER:?DB_USER wajib}"
: "${DB_PASSWORD:-}"
: "${JWT_SECRET:?JWT_SECRET wajib (min 32 char, bukan default/placeholder)}"

BACKEND="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${BACKEND}"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✅ PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ❌ FAIL: $1 — $2"; }

PSQL="env PGPASSWORD=${DB_PASSWORD:-} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -t -A"

# ── Run-scoped fixtures ─────────────────────────────
# Setiap run pakai prefix unik supaya aman di DB shared
# dan bisa di-cleanup hanya milik run ini.
RUN_ID="$(date +%s%N | tail -c 7)_$$"
S_A=9${RUN_ID:0:1}101; S_B=9${RUN_ID:0:1}102
U_A=9${RUN_ID:0:1}101; U_B=9${RUN_ID:0:1}102; U_AD=9${RUN_ID:0:1}103
U_KP=9${RUN_ID:0:1}104; U_SA=9${RUN_ID:0:1}105
R_A=9${RUN_ID:0:1}101; R_B=9${RUN_ID:0:1}102

# ── Seed ─────────────────────────────────────────────
$PSQL -qc "INSERT INTO seksi(id,nama_seksi) VALUES (${S_A},'Seksi Alpha ${RUN_ID}'),(${S_B},'Seksi Beta ${RUN_ID}');"
$PSQL -qc "
INSERT INTO users(id, username, password, nama, id_seksi, role, is_active)
VALUES
 (${U_A},'emp_alpha_${RUN_ID}','x','Pegawai Alpha',${S_A},'PEGAWAI',true),
 (${U_B},'emp_beta_${RUN_ID}','x','Pegawai Beta',${S_B},'PEGAWAI',true),
 (${U_AD},'admin_alpha_${RUN_ID}','x','Admin Alpha',${S_A},'ADMIN_SEKSI',true),
 (${U_KP},'kepala_t6_${RUN_ID}','x','Kepala T6',NULL,'KEPALA_KANTOR',true),
 (${U_SA},'super_t6_${RUN_ID}','x','Super T6',NULL,'SUPERADMIN',true);"

HASH_PW=$(node -e "console.log(require('bcrypt').hashSync('pw_t6_test',12))")
if [[ -z "$HASH_PW" ]]; then
  echo "FATAL: gagal membuat hash bcrypt" >&2
  exit 2
fi
$PSQL -qc "UPDATE users SET password='${HASH_PW}' WHERE id IN (${U_A},${U_B},${U_AD},${U_KP},${U_SA});"

$PSQL -qc "
INSERT INTO laporan(id, id_user, judul, bulan, tahun, status)
VALUES (${R_A},${U_A},'Laporan Alpha ${RUN_ID}',1,2026,'draft'),
       (${R_B},${U_B},'Laporan Beta ${RUN_ID}',1,2026,'draft');"

echo "DB seeded (run ${RUN_ID})"

# ── Start test server ────────────────────────────────
export JWT_SECRET NODE_ENV=development DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD PORT=4466
node server.js &
SRV_PID=$!
SRV_OK=0
for i in $(seq 1 10); do
  if curl -s -o /dev/null "http://127.0.0.1:4466/health"; then SRV_OK=1; break; fi
  sleep 0.5
done
if [[ "$SRV_OK" -eq 0 ]]; then
  echo "FATAL: test server tidak siap di port 4466" >&2
  kill $SRV_PID 2>/dev/null
  exit 2
fi

cleanup() {
  kill $SRV_PID 2>/dev/null || true
  $PSQL -qc "DELETE FROM laporan WHERE id IN (${R_A},${R_B});" 2>/dev/null
  $PSQL -qc "DELETE FROM users WHERE id IN (${U_A},${U_B},${U_AD},${U_KP},${U_SA});" 2>/dev/null
  $PSQL -qc "DELETE FROM seksi WHERE id IN (${S_A},${S_B});" 2>/dev/null
  # Jangan hapus run sendiri
}
trap cleanup EXIT INT TERM

BASE="http://127.0.0.1:4466"

login() {
  curl -s -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$1\",\"password\":\"$2\"}" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}

TOKEN_EMP_A=$(login "emp_alpha_${RUN_ID}" pw_t6_test)
TOKEN_EMP_B=$(login "emp_beta_${RUN_ID}"  pw_t6_test)
TOKEN_ADMIN_A=$(login "admin_alpha_${RUN_ID}" pw_t6_test)
TOKEN_KP=$(login "kepala_t6_${RUN_ID}" pw_t6_test)
TOKEN_SA=$(login "super_t6_${RUN_ID}" pw_t6_test)

# Guard: semua token harus non-empty
for pair in "EMP_A:$TOKEN_EMP_A" "EMP_B:$TOKEN_EMP_B" "ADMIN_A:$TOKEN_ADMIN_A" "KP:$TOKEN_KP" "SA:$TOKEN_SA"; do
  name="${pair%%:*}"; tok="${pair#*:}"
  if [[ -z "$tok" ]]; then
    echo "FATAL: login gagal untuk $name (password fixture / hash bcrypt salah)" >&2
    exit 2
  fi
done
echo "Tokens acquired"

# ═══════════════════════════════════════════════
# S1: is_active enforcement
# ═══════════════════════════════════════════════
echo "--- S1: Deactivated user token rejected ---"
$PSQL -qc "UPDATE users SET is_active=false WHERE id=${U_B};"
S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/laporan/my" -H "Authorization: Bearer $TOKEN_EMP_B")
[[ "$S" == "401" ]] && ok "token pegawai B nonaktif → 401" || bad "token nonaktif" "status=$S"
MSG=$(curl -s "$BASE/api/laporan/my" -H "Authorization: Bearer $TOKEN_EMP_B" | \
      python3 -c "import sys,json; print(json.load(sys.stdin).get('message',''))" 2>/dev/null)
[[ "$MSG" == "Akun nonaktif" ]] && ok "pesan error spesifik 'Akun nonaktif'" || bad "pesan nonaktif" "$MSG"
$PSQL -qc "UPDATE users SET is_active=true WHERE id=${U_B};"

# ═══════════════════════════════════════════════
# S2: Role separation
# ═══════════════════════════════════════════════
echo "--- S2: Role-based access control ---"
S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/admin-section/dashboard" -H "Authorization: Bearer $TOKEN_KP")
[[ "$S" == "403" ]] && ok "kepala akses admin-section → 403" || bad "kepala→admin-section" "status=$S"

S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/kepala/reports/pending" -H "Authorization: Bearer $TOKEN_EMP_A")
[[ "$S" == "403" ]] && ok "pegawai akses kepala endpoint → 403" || bad "pegawai→kepala" "status=$S"

S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/users" -H "Authorization: Bearer $TOKEN_ADMIN_A")
[[ "$S" == "403" ]] && ok "admin seksi akses user mgmt → 403" || bad "admin→users" "status=$S"

S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/users" -H "Authorization: Bearer $TOKEN_SA")
[[ "$S" == "200" ]] && ok "superadmin akses user mgmt → 200" || bad "superadmin→users" "status=$S"

# ═════════════════════════════════════════════��═
# S3: Data ownership
# ═══════════════════════════════════════════════
echo "--- S3: Data ownership enforcement ---"
# pegawai B tries to submit (POST) report owned by pegawai A
CROSS_SUBMIT=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/laporan/${R_A}/submit" \
  -H "Authorization: Bearer $TOKEN_EMP_B" -H "Content-Type: application/json" -d '{}')
[[ "$CROSS_SUBMIT" == "403" || "$CROSS_SUBMIT" == "404" ]] \
  && ok "pegawai B submit laporan A → $CROSS_SUBMIT" \
  || bad "lintas-pemilik submit" "status=$CROSS_SUBMIT"

# pegawai B tries to edit (PUT) report owned by pegawai A
CROSS_EDIT=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/laporan/${R_A}" \
  -H "Authorization: Bearer $TOKEN_EMP_B" -H "Content-Type: application/json" \
  -d '{"judul":"Sabotase","bulan":1,"tahun":2026}')
OWN_EDIT=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/laporan/${R_B}" \
  -H "Authorization: Bearer $TOKEN_EMP_B" -H "Content-Type: application/json" \
  -d '{"judul":"Revisi Beta","bulan":1,"tahun":2026}')
[[ "$CROSS_EDIT" == "403" || "$CROSS_EDIT" == "404" ]] \
  && ok "pegawai B edit laporan A → $CROSS_EDIT" \
  || bad "lintas-pemilik edit" "status=$CROSS_EDIT"
[[ "$OWN_EDIT" == "200" ]] \
  && ok "pegawai B edit draft sendiri → 200" \
  || bad "edit sendiri" "status=$OWN_EDIT"

# ═══════════════════════════════════════════════
# S4: Workflow integrity
# ═══════════════════════════════════════════════
echo "--- S4: Workflow state machine ---"
S=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/laporan/${R_A}/submit" \
  -H "Authorization: Bearer $TOKEN_EMP_A" -H "Content-Type: application/json" -d '{}')
[[ "$S" == "200" ]] && ok "submit draft → 200" || bad "submit" "status=$S"

# Kepala approve directly (must fail: belum diverifikasi admin_seksi)
S=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/kepala/reports/${R_A}/approve" \
  -H "Authorization: Bearer $TOKEN_KP" -H "Content-Type: application/json" \
  -d '{"status":"disetujui"}')
[[ "$S" == "400" ]] && ok "kepala approve tanpa verifikasi admin → 400" || bad "approve melompati" "status=$S"

# Admin seksi verify
S=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/laporan/${R_A}/verify" \
  -H "Authorization: Bearer $TOKEN_ADMIN_A" -H "Content-Type: application/json" \
  -d '{"status":"diverifikasi","catatan":"lulus"}')
[[ "$S" == "200" ]] && ok "admin verifikasi → 200" || bad "verifikasi" "status=$S"

# Now kepala can approve
S=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/kepala/reports/${R_A}/approve" \
  -H "Authorization: Bearer $TOKEN_KP" -H "Content-Type: application/json" \
  -d '{"status":"disetujui","catatan":"OK"}')
[[ "$S" == "200" ]] && ok "kepala approve setelah verifikasi → 200" || bad "approve valid" "status=$S"

# Double-approve should fail
S=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/kepala/reports/${R_A}/approve" \
  -H "Authorization: Bearer $TOKEN_KP" -H "Content-Type: application/json" \
  -d '{"status":"disetujui"}')
[[ "$S" == "400" ]] && ok "approve ulang (sudah disetujui) → 400" || bad "double approve" "status=$S"

# ═══════════════════════════════════════════════
# S5: Input validation on kepala endpoints
# ═══════════════════════════════════════════════
echo "--- S5: Input validation ---"
S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/kepala/reports?bulan=13" -H "Authorization: Bearer $TOKEN_KP")
[[ "$S" == "400" ]] && ok "bulan=13 → 400" || bad "bulan invalid" "status=$S"

S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/kepala/reports?bulan=1&status=invalid_status" -H "Authorization: Bearer $TOKEN_KP")
[[ "$S" == "400" ]] && ok "status=invalid → 400" || bad "status invalid" "status=$S"

S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/kepala/reports?bulan=1&status=diteruskan" -H "Authorization: Bearer $TOKEN_KP")
[[ "$S" == "200" ]] && ok "filter status valid → 200" || bad "filter valid" "status=$S"

S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/kepala/reports/abc/approve" -X POST \
  -H "Authorization: Bearer $TOKEN_KP" -H "Content-Type: application/json" -d '{"status":"disetujui"}')
[[ "$S" == "400" ]] && ok "approve id=abc → 400" || bad "id non-numeric" "status=$S"

S=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/kepala/history?bulan=99" -H "Authorization: Bearer $TOKEN_KP")
[[ "$S" == "400" ]] && ok "history bulan=99 → 400" || bad "history bulan invalid" "status=$S"

# ═══════════════════════════════════════════════
# S6: Error response hygiene
# ═══════════════════════════════════════════════
echo "--- S6: Error hygiene ---"
RESP=$(curl -s "$BASE/api/kepala/reports/99999/approve" -X POST \
  -H "Authorization: Bearer $TOKEN_KP" -H "Content-Type: application/json" -d '{"status":"disetujui"}')
S=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',''))" 2>/dev/null)
[[ "$S" == "False" ]] && ok "approve tidak ditemukan → success=false" || bad "hygiene" "success=$S"
echo "$RESP" | grep -qiE 'SQL|SELECT|UPDATE|INSERT|DELETE|pool|postgres|stack' \
  && bad "error bocor detail teknis" "$RESP" \
  || ok "error tanpa bocor detail teknis"

echo ""
echo "=== E2E RESULT: ${PASS} passed, ${FAIL} failed, $((PASS+FAIL)) total (run ${RUN_ID}) ==="
[[ $FAIL -gt 0 ]] && exit 1 || exit 0
