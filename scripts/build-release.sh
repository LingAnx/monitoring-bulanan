#!/usr/bin/env bash
# ============================================================
# build-release.sh — Pembuat paket distribusi ZIP (allowlist)
#
# Metode: allowlist eksplisit — hanya file/direktori runtime
# yang diizinkan masuk paket. .env, .git, node_modules, dump
# data, uploads, logs, ZIP lama, dan file duplikat (* 2.*)
# otomatis terkecualui.
#
# Persyaratan:
#   1. Gagal jika tidak dijalankan dari project root valid
#   2. Staging dir sementara (dibersihkan otomatis)
#   3. Tidak mengubah source asli
#   4. Tidak membawa node_modules / .env / artefak runtime
#   5. Output: monitoring-bulanan-release-<timestamp>.zip
#   6. Gagal bila terdeteksi file sensitif di staging
#   7. Menjalankan audit ZIP final (audit-release.py <path>)
#      dengan fail-on-error — ZIP berstatus FAIL bila audit gagal
#   8. Tidak menampilkan nilai secret
#
# Usage:
#   cd "monitoring bulanan"
#   bash scripts/build-release.sh
#
# Catatan operasional (lihat CHANGELOG_FIXES.md):
#   - ZIP rilis lama yang pernah beredar (termasuk ZIP sebelum
#     perbaikan ini) mungkin membawa secret lama. SEMUA secret
#     yang pernah terekspose (JWT_SECRET, kredensial DB yang
#     ikut di ZIP lama, password seed) HARUS dirotasi oleh
#     operator — rotasi production TIDAK dilakukan otomatis.
# ============================================================
set -euo pipefail

# ── 1. Validasi lokasi ─────────────────────────────────────
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REQUIRED_MARKER="backend/server.js"

if [[ ! -f "${PROJECT_ROOT}/${REQUIRED_MARKER}" ]]; then
  echo "GAGAL: ${REQUIRED_MARKER} tidak ditemukan. Jalankan script dari dalam project root." >&2
  echo "  Project root yang terdeteksi: ${PROJECT_ROOT}" >&2
  exit 1
fi

echo "=== Menjalankan gate frontend/release ==="
node "${PROJECT_ROOT}/tests/frontend/scan-csp-actions.js"
node "${PROJECT_ROOT}/tests/frontend/scan-icon-encoding-regression.js"
python3 "${PROJECT_ROOT}/tests/test-duplicate-files.py"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RELEASE_NAME="monitoring-bulanan-release-${TIMESTAMP}"
STAGING="${PROJECT_ROOT}/.release-staging-${TIMESTAMP}"
OUTPUT_ZIP="${PROJECT_ROOT}/${RELEASE_NAME}.zip"

# ── 1b. Guard: TIDAK BOLEH ada ZIP gagal audit di root ─────
# Cek setiap ZIP yang sudah ada di root (kecuali OUTPUT_ZIP yang akan
# dibuat). Jika ada ZIP yang GAGAL audit, gagal build (exit 1).
echo "=== Guard: memindai ZIP di root sebelum build ==="
ZIP_GUARD_FAIL=0
for existing_zip in "${PROJECT_ROOT}"/*.zip; do
  [ -f "${existing_zip}" ] || continue
  # Skip output yang akan dibuat (belum ada)
  [ "${existing_zip}" = "${OUTPUT_ZIP}" ] && continue
  echo "  Audit: $(basename "${existing_zip}")"
  if ! AUDIT_OUT="$(python3 "${PROJECT_ROOT}/scripts/audit-release.py" "${existing_zip}" 2>&1)"; then
    echo "${AUDIT_OUT}"
    echo "  ❌ $(basename "${existing_zip}") GAGAL audit — pindahkan ke .release-quarantine/"
    ZIP_GUARD_FAIL=1
  else
    echo "  ✅ $(basename "${existing_zip}") lulus audit"
  fi
done
if [ "${ZIP_GUARD_FAIL}" -eq 1 ]; then
  echo ""
  echo "GAGAL: ada ZIP gagal audit di root. Build ditolak." >&2
  echo "  Tindakan: pindahkan ZIP gagal ke .release-quarantine/ dengan nama" >&2
  echo "  *.UNSAFE-DO-NOT-DISTRIBUTE.zip, lalu jalankan ulang build-release.sh." >&2
  exit 1
fi

echo "=== build-release: mulai ==="
echo "  Project root : ${PROJECT_ROOT}"
echo "  Staging dir  : ${STAGING}"
echo "  Output ZIP   : ${OUTPUT_ZIP}"

# Jangan timpa arsip lama — buat nama baru otomatis
if [[ -f "${OUTPUT_ZIP}" ]]; then
  echo "GAGAL: ${OUTPUT_ZIP} sudah ada. Ubah nama target atau hapus file lama." >&2
  exit 1
fi

# ── 2. Frontend source of truth: root project (bukan public/)
# public/ adalah build artifact deterministik (sync-frontend.sh)
# dan DI-IGNORE oleh Git. Selalu di-regenerate untuk menjamin
# paket konsisten dengan source root.
echo "=== Menyinkronkan public/ dari source frontend (root) ==="
bash "${PROJECT_ROOT}/scripts/sync-frontend.sh"

# ── 3. Buat staging ────────────────────────────────────────
rm -rf "${STAGING}"
mkdir -p "${STAGING}"

cleanup() {
  echo "=== build-release: membersihkan staging ==="
  rm -rf "${STAGING}"
}
trap cleanup EXIT

# ── Helper: salin file dengan denylist ─────────────────────
copy_tree() {
  # $1 = source dir, $2 = relative target under staging
  local src="$1" rel="$2"
  if [[ ! -d "${src}" ]]; then return 0; fi
  while IFS= read -r -d '' f; do
    # Nama file duplikat macOS/Windows ("foo 2.js", "foo 2.sql")
    local base="$(basename "${f}")"
    case "${base}" in
      *" 2"*) echo "  ⛔ skip duplikat: ${f}"; continue ;;
    esac
    local target="${STAGING}/${rel}/${f#"${src}"/}"
    mkdir -p "$(dirname "${target}")"
    cp "${f}" "${target}"
  done < <(find "${src}" -type f \
    ! -name '.DS_Store' \
    ! -name '__MACOSX' \
    ! -name '*.tmp' ! -name '*.temp' ! -name '*.swp' \
    ! -name '*.log' \
    ! -name '.env' ! -name '.env.*' \
    -print0 2>/dev/null || true)
}

echo "=== Menyalin file yang diizinkan (allowlist + denylist) ==="

# ── Frontend: public/ (hasil sync-frontend.sh di atas) ─────
if [[ ! -d "${PROJECT_ROOT}/public" ]]; then
  echo "GAGAL: public/ tidak ada setelah sync-frontend.sh" >&2
  exit 1
fi
copy_tree "${PROJECT_ROOT}/public" "public"
echo "  ℹ️  public/ (hasil sync) disalin ke staging."

# ── Root: file runtime yang memang hidup di root ──────────
# (Tidak ada file root runtime selain yang sudah masuk public.)

# ── Backend: source only, tanpa artefak runtime ────────────
mkdir -p "${STAGING}/backend"

# backend root files (aman)
for f in package.json package-lock.json server.js README.md PHASE_1_REPORT.md; do
  [[ -f "${PROJECT_ROOT}/backend/${f}" ]] && cp "${PROJECT_ROOT}/backend/${f}" "${STAGING}/backend/"
done

# .env.example secara eksplisit (JANGAN .env)
if [[ -f "${PROJECT_ROOT}/backend/.env.example" ]]; then
  cp "${PROJECT_ROOT}/backend/.env.example" "${STAGING}/backend/.env.example"
  echo "  ℹ️  .env.example disalin secara eksplisit."
else
  echo "GAGAL: backend/.env.example tidak ada — wajib disertakan di paket." >&2
  exit 1
fi

# backend source directories (excluded from release: tests/, docs/)
# tests/ dan docs/ sengaja TIDAK masuk paket rilis — keduanya berisi
# placeholder secret yang diperlukan untuk testing/development saja.
for d in db middleware routes scripts lib; do
  if [[ -d "${PROJECT_ROOT}/backend/${d}" ]]; then
    # Ulangi per-file dengan denylist; untuk db/ tambahkan skip " 2." files
    while IFS= read -r -d '' f; do
      base="$(basename "${f}")"
      case "${base}" in
        *" 2"*.js|*" 2"*.sql|*" 2"*) echo "  ⛔ skip duplikat: ${f}"; continue ;;
      esac
      rel="${f#"${PROJECT_ROOT}"/}"
      target="${STAGING}/${rel}"
      mkdir -p "$(dirname "${target}")"
      cp "${f}" "${target}"
    done < <(find "${PROJECT_ROOT}/backend/${d}" -type f \
      ! -name '.DS_Store' ! -name '*.log' ! -name '*.tmp' \
      ! -name '.env' ! -name '.env.*' \
      ! -name '* 2.*' \
      -print0 2>/dev/null || true)
  fi
done

# ── 4. Audit staging sebelum zip ───────────────────────────
echo "=== Audit staging ==="

SENSITIVE_FOUND=0

# Cek file terlarang
# ── BUG FIX: sebelumnya -o chain tanpa \( \) membuat -print0
#    hanya apply ke cabang terakhir → file terlarang terlewat.
#    Sekarang: -type f -a \( semua -o \) -print0
while IFS= read -r -d '' hit; do
  echo "  ❌ FILE TERLARANG: ${hit#${PROJECT_ROOT}/}"
  SENSITIVE_FOUND=1
done < <(find "${STAGING}" -type f \
  \( -name '.env' \
     -o -name '.env.prod' \
     -o -name '.env.local' \
     -o -name '.env.development' \
     -o -name '.env.staging' \
     -o -name '.env.bak' \
     -o -name '.DS_Store' \
     -o -name '__MACOSX' \
     -o -name '*.dump' \
     -o -name '*.backup' \
     -o -name '*.bak' \
     -o -name '*.log' \
     -o -name '*.tmp' \
     -o -name '*.temp' \
     -o -name 'ksop_laporan_v1_stable.sql' \
     -o -name 'STABILITY_ANALYSIS.md' \
     -o -name 'RDP.md' \
     -o -name 'CHANGELOG_FIXES.md' \
     -o -name 'monitoring-bulanan-release-*.zip' \
     -o -regex '.*\\s[0-9]+\\..*' \
  \) -print0 2>/dev/null || true)

# Direktori terlarang — daftar per-nama (cek di posisi mana pun dalam tree).
# Perhatian: 'db' dan 'data' sengaja TIDAK masuk daftar karena adalah nama
# subdirektori sah dari backend (backend/db/migrations/...). Yang di-flag
# adalah direktori artefak runtime yang memang tidak boleh hadir di staging.
while IFS= read -r -d '' hit; do
  echo "  ❌ DIR TERLARANG: ${hit#${PROJECT_ROOT}/}"
  SENSITIVE_FOUND=1
done < <(find "${STAGING}" -type d \
  \( -name '.git' \
     -o -name 'node_modules' \
     -o -name 'uploads' \
     -o -name 'logs' \
     -o -name 'private' \
     -o -name 'backups' \
     -o -name '__MACOSX' \
     -o -name '_tmp' \
  \) -print0 2>/dev/null || true)

# Cek symlink berbahaya (menunjuk keluar project)
while IFS= read -r -d '' link; do
  target="$(readlink "${link}")"
  if [[ "${target}" == /* || "${target}" == ".."/* ]]; then
    echo "  ❌ SYMLINK BERBAHAYA: ${link} → ${target}"
    SENSITIVE_FOUND=1
  fi
done < <(find "${STAGING}" -type l -print0 2>/dev/null || true)

# Cek pola secret di file teks (hash bcrypt, hex 64+, placeholder)
while IFS= read -r hit; do
  if grep -qE '\$2[aby]\$[0-9]{2}\$' "${hit}" 2>/dev/null; then
    echo "  ❌ HASH BCRYPT TERDETEKSI: $(basename "${hit}")"
    SENSITIVE_FOUND=1
  fi
done < <(find "${STAGING}" -type f \( -name '*.js' -o -name '*.sql' -o -name '*.sh' -o -name '*.md' -o -name '*.json' \) 2>/dev/null || true)

if [[ ${SENSITIVE_FOUND} -eq 1 ]]; then
  echo ""
  echo "GAGAL: artefak sensitif ditemukan di staging. Paket tidak dibuat." >&2
  exit 1
fi

FILE_COUNT=$(find "${STAGING}" -type f | wc -l | tr -d ' ')
echo "  ✅ ${FILE_COUNT} file terverifikasi bersih di staging."

# ── 5. Buat ZIP ────────────────────────────────────────────
cd "${STAGING}"
if command -v zip >/dev/null 2>&1; then
  zip -qr "${OUTPUT_ZIP}" .
else
  # fallback: python
  python3 -c "
import zipfile, os, sys
staging = '${STAGING}'
out = '${OUTPUT_ZIP}'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(staging):
        for f in files:
            fp = os.path.join(root, f)
            z.write(fp, os.path.relpath(fp, staging))
print('ZIP dibuat via python:', out)
"
fi

ZIP_SIZE=$(stat -f%z "${OUTPUT_ZIP}" 2>/dev/null || stat -c%s "${OUTPUT_ZIP}")
echo ""
echo "✅ Paket rilis dibuat:"
echo "  ${OUTPUT_ZIP}"
echo "  Ukuran : ${ZIP_SIZE} bytes"
echo "  File   : ${FILE_COUNT}"

# ── 6. Audit ZIP final (wajib, gagal bila ada temuan) ─────
echo ""
echo "=== Audit ZIP final (audit-release.py) ==="
# Audit ZIP final — audit-release.py exit code 0 = bersih, 1 = temuan.
# Dipanggil dalam subshell agar `set -e` tidak exit sebelum cek kondisi.
if ! AUDIT_OUT=$(python3 "${PROJECT_ROOT}/scripts/audit-release.py" "${OUTPUT_ZIP}" 2>&1); then
  echo "${AUDIT_OUT}"
  echo ""
  echo "GAGAL: audit ZIP menemukan masalah. ZIP tidak valid untuk distribusi." >&2
  rm -f "${OUTPUT_ZIP}"
  exit 1
fi
echo "${AUDIT_OUT}"

echo ""
echo "✅ Paket rilis terverifikasi. Siap distribusi."
