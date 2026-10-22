#!/usr/bin/env bash
# sync-frontend.sh — salin file frontend dari project root ke public/
# Jalankan setelah mengubah file frontend, lalu build paket rilis.
# Struktur: persis sama dengan URL yang diakses browser (root-relative).
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUB="${PROJECT_ROOT}/public"

if [[ ! -d "${PROJECT_ROOT}/employee" ]]; then
  echo "GAGAL: project root tidak valid (${PROJECT_ROOT})" >&2
  exit 1
fi

rm -rf "${PUB}"
mkdir -p "${PUB}"

# Root frontend files
for f in \
  index.html login.html index.js login.js app.js translations.js \
  admin-section-layout.css approve.css dashboard.css form.css \
  head-office-layout.css index.css lampiran.css laporan.css login.css \
  notifikasi.css pegawai.css profil.css rekap.css style.css users.css verify.css
do
  if [[ -f "${PROJECT_ROOT}/${f}" ]]; then
    cp "${PROJECT_ROOT}/${f}" "${PUB}/${f}"
  else
    echo "⚠️  Root file tidak ditemukan: ${f}" >&2
  fi
done

# Role directories
for d in admin-section employee head-office superadmin js; do
  if [[ -d "${PROJECT_ROOT}/${d}" ]]; then
    mkdir -p "${PUB}/${d}"
    find "${PROJECT_ROOT}/${d}" -type f ! -name '.DS_Store' -print0 | while IFS= read -r -d '' f; do
      rel="${f#${PROJECT_ROOT}/}"
      mkdir -p "${PUB}/$(dirname "${rel}")"
      cp "${f}" "${PUB}/${rel}"
    done
  fi
done

COUNT=$(find "${PUB}" -type f | wc -l | tr -d ' ')
echo "✅ public/ dibuat: ${COUNT} file."
echo "   Jalankan ulang script ini setiap mengubah file frontend."
