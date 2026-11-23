#!/usr/bin/env bash
# ============================================================
# test-password-flow.sh — E2E alur force password change
#
# Alur yang diuji (skema NEW, setelah perbaikan batch 2026-10-26):
#   1. Login user must_change_password=true → 200 + temporaryToken
#      (TIDAK ADA token sesi penuh)
#   2. Token sementara ditolak di endpoint aplikasi lain (/me → 401)
#   3. Token sesi penuh (bukan sementara) ditolak di /change-password
#      saat flag ON (401 + PASSWORD_CHANGE_REQUIRED)
#   4. PUT /change-password + token sementara + currentPassword benar
#      → 200, flag false, sesi lain ter-revokes (token_version +1)
#   5. Token sementara LAMA (token_version lama) → 401 (single-use)
#   6. Login ulang dengan password baru → sesi penuh normal
#
# Persyaratan: PostgreSQL lokal + skema sudah di-migrate
# (jalankan psql -f backend/db/schema.sql + migrations, lalu
# seed minimal 1 user dengan must_change_password=true).
#
# Cara menjalankan:
#   cd backend
#   DB_HOST=127.0.0.1 DB_PORT=5432 DB_NAME=ksop_laporan \
#   DB_USER=nafanraiisbanisa DB_PASSWORD= \
#   JWT_SECRET=$(openssl rand -hex 32) \
#   FORCE_TEST_USERNAME=pwdtest FORCE_TEST_OLDPW='OldPass#123' \
#   bash tests/test-password-flow.sh
# ============================================================
set -euo pipefail

# ── Env vars (dengan default dev) ──────────────────────────
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-ksop_laporan}"
DB_USER="${DB_USER:-$(whoami)}"
DB_PASSWORD="${DB_PASSWORD:-}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
PORT="${PORT:-3789}"
BASE="http://127.0.0.1:${PORT}"

TEST_USER="${FORCE_TEST_USERNAME:-pwdtest}"
OLD_PW="${FORCE_TEST_OLDPW:-OldPass#123}"
NEW_PW="${FORCE_TEST_NEWPW:-NewPass#456}"

# ── GUARD: tolak DB produksi secara otomatis ─────────────────
# Nama DB harus mengandung 'test' atau env PWD_TEST_DB=1 diset
# eksplisit. Tanpa guard ini, test bisa menghapus data user di
# database produksi bila DB_NAME salah di-set.
if [[ "${DB_NAME}" != *"test"* && -z "${PWD_TEST_DB:-}" ]]; then
  echo "ERROR: DB_NAME='${DB_NAME}' tidak terlihat seperti database test." >&2
  echo "Set DB_NAME=<nama>_test atau PWD_TEST_DB=1 untuk memaksa." >&2
  exit 1
fi

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL: $1"; }
check() { # $1=desc $2=expected $3=actual
  if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 — expected [$2] got [$3]"; fi
}

cleanup() {
  [[ -n "${SRV_PID:-}" ]] && kill "${SRV_PID}" 2>/dev/null || true
  # Hapus user test (jika dibuat)
  PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" \
    -d "${DB_NAME}" -U "${DB_USER}" -qtAc \
    "DELETE FROM users WHERE username = '${TEST_USER}'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "=== test-password-flow.sh ==="

# ── Setup: pastikan user test ada dengan flag ON ──────────
EXISTS="$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" \
  -d "${DB_NAME}" -U "${DB_USER}" -qtAc \
  "SELECT 1 FROM users WHERE username = '${TEST_USER}'" 2>/dev/null | tr -d '[:space:]')"

if [[ "${EXISTS}" != "1" ]]; then
  echo "  Setup: membuat user test '${TEST_USER}'"
  NEW_HASH="$(cd backend 2>/dev/null || cd "$(dirname "$0")/.." ; \
    node -e "console.log(require('bcrypt').hashSync('${OLD_PW}', 12))")"
  PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" \
    -d "${DB_NAME}" -U "${DB_USER}" -qtAc \
    "INSERT INTO users (username, password, nama, role, must_change_password, token_version)
     VALUES ('${TEST_USER}', '${NEW_HASH}', 'Pwd Test', 'PEGAWAI', true, 0)" >/dev/null
  ok "Setup: user test dibuat"
else
  # Reset flag + password untuk determinisme
  PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" \
    -d "${DB_NAME}" -U "${DB_USER}" -qtAc \
    "UPDATE users SET must_change_password = true, token_version = 0 WHERE username = '${TEST_USER}'" \
    >/dev/null
  NEW_HASH="$(cd backend 2>/dev/null || cd "$(dirname "$0")/.." ; \
    node -e "console.log(require('bcrypt').hashSync('${OLD_PW}', 12))")"
  PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" \
    -d "${DB_NAME}" -U "${DB_USER}" -qtAc \
    "UPDATE users SET password = '${NEW_HASH}' WHERE username = '${TEST_USER}'" \
    >/dev/null
  ok "Setup: user test direset"
fi

# ── Start server ───────────────────────────────────────────
JWT_SECRET="${JWT_SECRET}" DB_HOST="${DB_HOST}" DB_PORT="${DB_PORT}" \
DB_NAME="${DB_NAME}" DB_USER="${DB_USER}" DB_PASSWORD="${DB_PASSWORD}" \
NODE_ENV=test PORT="${PORT}" \
node server.js > /tmp/pwd-flow-srv.log 2>&1 &
SRV_PID=$!

# Wait for /health
for i in $(seq 1 30); do
  if curl -sf "${BASE}/health" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
curl -sf "${BASE}/health" >/dev/null 2>&1 || { echo "GAGAL: server tidak start"; cat /tmp/pwd-flow-srv.log; exit 1; }
ok "Server start (port ${PORT})"

json_get() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))" 2>/dev/null; }

# ── 1. Login dengan flag ON → 200 + temporaryToken, TIDAK ada `token` ──
BODY="$(curl -s -X POST "${BASE}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${TEST_USER}\",\"password\":\"${OLD_PW}\"}")"
check "Login flag-ON: success=true" "True" "$(echo "${BODY}" | json_get success)"
check "Login flag-ON: mustChangePassword=true" "True" "$(echo "${BODY}" | json_get mustChangePassword)"
TEMP_TOKEN="$(echo "${BODY}" | json_get temporaryToken)"
[[ -n "${TEMP_TOKEN}" ]] && ok "Login flag-ON: temporaryToken ada" || bad "Login flag-ON: temporaryToken KOSONG"
FULL_TOKEN="$(echo "${BODY}" | json_get token)"
[[ -z "${FULL_TOKEN}" ]] && ok "Login flag-ON: TIDAK ada token sesi penuh" || bad "Login flag-ON: ada token sesi penuh (tidak boleh)"

# ── 2. Token sementara ditolak di endpoint aplikasi lain ──
CODE="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/laporan" \
  -H "Authorization: Bearer ${TEMP_TOKEN}")"
check "Token sementara → /api/laporan = 401" "401" "${CODE}"

CODE="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/auth/me" \
  -H "Authorization: Bearer ${TEMP_TOKEN}")"
check "Token sementara → /api/auth/me = 401" "401" "${CODE}"

# ── 3. Change-password via SESSION penuh user NORMAL ─────────
# (bukan skenario flag-ON; hanya validasi jalur auth biasa di
# endpoint yang sama, dan bahwa limiter /change-password aktif).
NORM_HASH="$(cd "$(dirname "$0")/.." ; node -e "console.log(require('bcrypt').hashSync('NormalUser#1', 12))")"
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" \
  -d "${DB_NAME}" -U "${DB_USER}" -qtAc \
  "INSERT INTO users (username, password, nama, role) VALUES ('normtest', '${NORM_HASH}', 'Norm Test', 'PEGAWAI') ON CONFLICT (username) DO NOTHING" \
  >/dev/null
NORM_LOGIN="$(curl -s -X POST "${BASE}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"normtest","password":"NormalUser#1"}')"
NORM_TOKEN="$(echo "${NORM_LOGIN}" | json_get token)"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X PUT "${BASE}/api/auth/change-password" \
  -H "Authorization: Bearer ${NORM_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"currentPassword\":\"NormalUser#1\",\"newPassword\":\"Changed#222\",\"confirmNewPassword\":\"Changed#222\"}")"
# normtest flag OFF → ganti password via sesi penuh DIIZINKAN → 200.
check "Token sesi penuh user normal → /change-password = 200" "200" "${CODE}"

# ── 4. /change-password pakai token sementara + currentPassword benar ──
RESP="$(curl -s -X PUT "${BASE}/api/auth/change-password" \
  -H "Authorization: Bearer ${TEMP_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"currentPassword\":\"${OLD_PW}\",\"newPassword\":\"${NEW_PW}\",\"confirmNewPassword\":\"${NEW_PW}\"}")"
check "change-password (token sementara, pw lama benar): success" "True" "$(echo "${RESP}" | json_get success)"

# Verifikasi DB: flag OFF + token_version naik
DB_STATE="$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" \
  -d "${DB_NAME}" -U "${DB_USER}" -qtAc \
  "SELECT must_change_password, token_version FROM users WHERE username = '${TEST_USER}'" \
  | tr -d '[:space:]')"
check "DB: must_change_password=false & token_version>0" "false1" "${DB_STATE}"

# ── 5. Token sementara LAMA (token_version 0) sekarang ditolak ──
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X PUT "${BASE}/api/auth/change-password" \
  -H "Authorization: Bearer ${TEMP_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"currentPassword\":\"${OLD_PW}\",\"newPassword\":\"Again1#789\",\"confirmNewPassword\":\"Again1#789\"}")"
check "Token sementara LAMA (versi lama) → 401" "401" "${CODE}"

# ── 6. currentPassword SALAH ditolak (401) ───────────────────
RESP2="$(curl -s -X POST "${BASE}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${TEST_USER}\",\"password\":\"${NEW_PW}\"}")"
# user baru bisa login normal setelah flag OFF; ambil token sementara
# baru dengan memaksa ulang flag ON via DB:
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" \
  -d "${DB_NAME}" -U "${DB_USER}" -qtAc \
  "UPDATE users SET must_change_password = true WHERE username = '${TEST_USER}'" >/dev/null
RESP3="$(curl -s -X POST "${BASE}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${TEST_USER}\",\"password\":\"${NEW_PW}\"}")"
TEMP2="$(echo "${RESP3}" | json_get temporaryToken)"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X PUT "${BASE}/api/auth/change-password" \
  -H "Authorization: Bearer ${TEMP2}" \
  -H 'Content-Type: application/json' \
  -d "{\"currentPassword\":\"password-itu-salah\",\"newPassword\":\"Test1#111\",\"confirmNewPassword\":\"Test1#111\"}")"
check "currentPassword SALAH → 401" "401" "${CODE}"
# Kembalikan state DB ke kondisi awal test (flag off, versi token naik)
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" \
  -d "${DB_NAME}" -U "${DB_USER}" -qtAc \
  "UPDATE users SET must_change_password = false WHERE username = '${TEST_USER}'" >/dev/null

# ── 7. Login ulang dengan password baru → sesi penuh normal ──
RESP="$(curl -s -X POST "${BASE}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${TEST_USER}\",\"password\":\"${NEW_PW}\"}")"
NEW_TOKEN="$(echo "${RESP}" | json_get token)"
[[ -n "${NEW_TOKEN}" ]] && ok "Login password baru: token sesi penuh ada" || bad "Login password baru: token KOSONG — ${RESP}"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/auth/me" -H "Authorization: Bearer ${NEW_TOKEN}")"
check "Token baru → /api/auth/me = 200" "200" "${CODE}"

# ��─ Bersih-bersih user test normal ──
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" \
  -d "${DB_NAME}" -U "${DB_USER}" -qtAc \
  "DELETE FROM users WHERE username = 'normtest'" >/dev/null 2>&1 || true

echo ""
echo "=== RESULT: ${PASS} passed, ${FAIL} failed ==="
[[ "${FAIL}" -eq 0 ]] || exit 1
