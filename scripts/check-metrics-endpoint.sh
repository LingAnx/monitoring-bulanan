#!/usr/bin/env bash
# ============================================================
# check-metrics-endpoint.sh — Validasi dua-lapis proteksi /metrics
#
# Mode A (METRICS_TOKEN diset di environment saat menjalankan
# script): cek endpoint dengan/bermacam token.
# Mode B (tanpa METRICS_TOKEN): cek hanya path localhost vs
# IP lokal vs IP remote.
#
# Persyaratan: server sudah jalan di ${PORT:-3000}
# (NODE_ENV apa pun). Jika METRICS_TOKEN dipakai, set juga
# env di sisi server (sama persis dengan nilai di sini).
#
# Usage:
#   METRICS_TOKEN="<token yang sama dengan server>" PORT=3000 \
#     bash scripts/check-metrics-endpoint.sh
#   # atau tanpa token:
#   PORT=3000 bash scripts/check-metrics-endpoint.sh
# ============================================================
set -euo pipefail

PORT="${PORT:-3000}"
BASE="http://127.0.0.1:${PORT}"
TOKEN="${METRICS_TOKEN:-}"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
expect() { # $1=desc $2=expected $3=actual
  if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 — expected [$2] got [$3]"; fi
}

code_of() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "=== check-metrics-endpoint.sh ==="
echo "  Target: ${BASE}"
echo "  Mode  : $([[ -n "${TOKEN}" ]] && echo 'METRICS_TOKEN' || echo 'localhost-only')"
echo ""

# ── 1. Endpoint /health (kontrol) — selalu 200 ───────────────
H_CODE="$(code_of "${BASE}/health")"
expect "/health = 200 (kontrol)" "200" "${H_CODE}"

# ── 2. Uji proteksi /metrics ─────────────────────────────────
if [[ -n "${TOKEN}" ]]; then
  # 2a. Tanpa token → 404
  C1="$(code_of "${BASE}/metrics")"
  expect "Mode token: tanpa token → 404" "404" "${C1}"

  # 2b. Token salah → 404
  C2="$(code_of -H "Authorization: Bearer wrong-token" "${BASE}/metrics")"
  expect "Mode token: token SALAH → 404" "404" "${C2}"

  # 2c. Token benar → 200 + berisi uptimeSeconds & requests
  C3="$(code_of -H "Authorization: Bearer ${TOKEN}" "${BASE}/metrics")"
  expect "Mode token: token BENAR → 200" "200" "${C3}"
  RESP3="$(curl -s -H "Authorization: Bearer ${TOKEN}" "${BASE}/metrics")"
  echo "${RESP3}" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'uptimeSeconds' in d and 'requests' in d; print('  ✅ Respon /metrics punya uptimeSeconds & requests')" \
    || bad "Respon /metrics tidak memuat uptimeSeconds/requests"

  # 2d. Isi respons tidak boleh membocorkan detail
  RESP4="$(curl -s -H "Authorization: Bearer ${TOKEN}" "${BASE}/metrics")"
  if echo "${RESP4}" | grep -qE 'JWT_SECRET|DB_PASSWORD|stack'; then
    bad "Respon /metrics membocorkan secret/stack"
  else
    ok "Respon /metrics bersih (tanpa secret/stack)"
  fi
else
  # 2a. Tanpa token, localhost → 200
  C1="$(code_of "${BASE}/metrics")"
  expect "Mode localhost-only: /metrics dari localhost → 200" "200" "${C1}"

  # 2b. IP "remote" disimulasikan lewat header X-Forwarded-For
  #     (server Express + trust proxy 1 di belakang nginx/proxy;
  #      di test langsung dari localhost, req.ip tetap localhost
  #      — validasi ini bergantung pada deployment asli).
  echo "  ℹ️  Simulasi remote-IP hanya valid di deployment di belakang proxy (trust proxy)."
  echo "     Jalankan cek ini dari server operator yang benar-benar bukan 127.0.0.1 untuk validasi penuh."
fi

echo ""
echo "=== RESULT: ${PASS} passed, ${FAIL} failed ==="
[[ "${FAIL}" -eq 0 ]] || exit 1
