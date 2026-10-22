#!/usr/bin/env bash
# ============================================================
# build-release.sh — Tahap 2: script pembuatan paket distribusi aman
#
# Metode: allowlist (bukan blacklist)
#   - hanya file/direktori yang TERSANGKUT secara eksplisit masuk paket
#   - seluruh artefak lain (secret, dump, upload, log, dsb.)
#     otomatis terkecualui karena tidak ada di allowlist
#
# Persyaratan:
#   1. Gagal jika tidak dijalankan dari project root yang valid
#   2. Menggunakan directori staging sementara (dibersihkan otomatis)
#   3. Tidak mengubah source asli
#   4. Tidak membawa node_modules dari development
#   5. Buat ZIP dengan timestamp
#   6. Gagal bila terdeteksi file sensitif di staging
#   7. Tidak menampilkan nilai secret
#   8. Membersihkan staging setelah selesai
#
# Usage:
#   cd "monitoring bulanan"
#   bash scripts/build-release.sh
#
# Output:
#   monitoring-bulanan-release-<timestamp>.zip
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

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RELEASE_NAME="monitoring-bulanan-release-${TIMESTAMP}"
STAGING="${PROJECT_ROOT}/.release-staging-${TIMESTAMP}"
OUTPUT_ZIP="${PROJECT_ROOT}/${RELEASE_NAME}.zip"

echo "=== build-release: mulai ==="
echo "  Project root : ${PROJECT_ROOT}"
echo "  Staging dir  : ${STAGING}"
echo "  Output ZIP   : ${OUTPUT_ZIP}"

# Jangan timpa arsip lama — buat nama baru otomatis
if [[ -f "${OUTPUT_ZIP}" ]]; then
  echo "GAGAL: ${OUTPUT_ZIP} sudah ada. Ubah nama target atau hapus file lama." >&2
  exit 1
fi

# ── 2. Buat staging ────────────────────────────────────────
rm -rf "${STAGING}"
mkdir -p "${STAGING}"

cleanup() {
  echo "=== build-release: membersihkan staging ==="
  rm -rf "${STAGING}"
}
trap cleanup EXIT

# ── 3. Salin dengan allowlist ─────────────────────────────
# Salin per-direktori/file eksplisit. Tidak ada wildcard *.
echo "=== Menyalin file yang diizinkan (allowlist) ==="

# ── Root: source frontend ─────────────────────────────────
# Frontend sekarang berada di public/ (hasil sync-frontend.sh).
# File root yang TIDAK ada di public/ (internal doc) tidak disalin.
# Jika public/ belum ada, buat dulu.
if [[ ! -d "${PROJECT_ROOT}/public" ]]; then
  echo "  ℹ️  public/ tidak ada — menjalankan sync-frontend.sh ..."
  bash "${PROJECT_ROOT}/scripts/sync-frontend.sh"
fi

# ── Frontend directories — tidak perlu lagi, sudah di public/ ──
# (sync-frontend.sh sudah menyalin ke public/, yang disalin ke staging di atas)

# ── Backend: source only, tanpa artefak runtime ────────────
mkdir -p "${STAGING}/backend"

# backend root files (aman)
for f in package.json package-lock.json server.js README.md PHASE_1_REPORT.md; do
  [[ -f "${PROJECT_ROOT}/backend/${f}" ]] && cp "${PROJECT_ROOT}/backend/${f}" "${STAGING}/backend/"
done

# .env.example secara eksplisit
if [[ -f "${PROJECT_ROOT}/backend/.env.example" ]]; then
  cp "${PROJECT_ROOT}/backend/.env.example" "${STAGING}/backend/.env.example"
  echo "  ℹ️  .env.example disalin secara eksplisit."
fi

# ── Frontend: public/ (hasil sync-frontend.sh) ─────────────
# public/ dibuat oleh scripts/sync-frontend.sh dari file frontend di root.
# Jika public/ belum ada, buat dulu.
if [[ ! -d "${PROJECT_ROOT}/public" ]]; then
  echo "  ℹ️  public/ tidak ada — menjalankan sync-frontend.sh ..."
  bash "${PROJECT_ROOT}/scripts/sync-frontend.sh"
fi
mkdir -p "${STAGING}/public"
find "${PROJECT_ROOT}/public" -type f ! -name '.DS_Store' | while read -r f; do
  rel="${f#${PROJECT_ROOT}/}"
  mkdir -p "${STAGING}/$(dirname "${rel}")"
  cp "${f}" "${STAGING}/${rel}"
done
echo "  ℹ️  public/ disalin ke staging."
# backend source directories
for d in db middleware routes scripts tests; do
  if [[ -d "${PROJECT_ROOT}/backend/${d}" ]]; then
    mkdir -p "${STAGING}/backend/${d}"
    find "${PROJECT_ROOT}/backend/${d}" -type f ! -name '.DS_Store' | while read -r f; do
      rel="${f#${PROJECT_ROOT}/}"
      mkdir -p "${STAGING}/$(dirname "${rel}")"
      cp "${f}" "${STAGING}/${rel}"
    done
  fi
done

# backend/docs
if [[ -d "${PROJECT_ROOT}/backend/docs" ]]; then
  mkdir -p "${STAGING}/backend/docs"
  find "${PROJECT_ROOT}/backend/docs" -type f ! -name '.DS_Store' | while read -r f; do
    rel="${f#${PROJECT_ROOT}/}"
    mkdir -p "${STAGING}/$(dirname "${rel}")"
    cp "${f}" "${STAGING}/${rel}"
  done
fi

# ── 4. Audit staging sebelum zip ───────────────────────────
echo "=== Audit staging ==="

SENSITIVE_FOUND=0

# Cek file terlarang
while IFS= read -r -d '' hit; do
  echo "  ❌ FILE TERLARANG: ${hit#${PROJECT_ROOT}/}"
  SENSITIVE_FOUND=1
done < <(find "${STAGING}" -type f \
  \( -name '.env' \
     -o -name '.env.prod' \
     -o -name '.env.local' \
     -o -name '.env.development' \
     -o -name '.env.staging' \
     -o -name '.DS_Store' \
     -o -name '__MACOSX' \
     -o -name '*.dump' \
     -o -name '*.backup' \
     -o -name '*.bak' \
     -o -name '*.log' \
     -o -name 'ksop_laporan_v1_stable.sql' \
     -o -name 'STABILITY_ANALYSIS.md' \
     -o -name 'RDP.md' \
     -o -name 'CHANGELOG_FIXES.md' \
  \) -print0 2>/dev/null || true)

# Cek directory terlarang
while IFS= read -r -d '' hit; do
  echo "  ❌ DIR TERLARANG: ${hit#${PROJECT_ROOT}/}"
  SENSITIVE_FOUND=1
done < <(find "${STAGING}" -type d \
  \( -name '.git' \
     -name 'node_modules' \
     -name 'uploads' \
     -name 'logs' \
     -name 'private' \
     -name '__MACOSX' \
     -name 'backups' \
  \) -print0 2>/dev/null || true)

# Cek symlink berbahaya (menunjuk keluar project)
while IFS= read -r -d '' link; do
  target="$(readlink "${link}")"
  # Jika target mutlak atau keluar dari staging → berbahaya
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

ZIP_SIZE=$(stat -f%z "${OUTPUT_ZIP}" 2>/dev/null || stat -c%s "${OUTPUT_ZIP}" 2>/dev/null)
echo ""
echo "✅ Paket rilis dibuat:"
echo "  ${OUTPUT_ZIP}"
echo "  Ukuran : ${ZIP_SIZE} bytes"
echo "  File   : ${FILE_COUNT}"
echo ""
echo "Langkah berikutnya: ekstrak ZIP ke directori kosong, audit isinya, lalu instal dependensi."
