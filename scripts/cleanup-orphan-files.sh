#!/usr/bin/env bash
# cleanup-orphan-files.sh
# Bersihkan file orphan: file di backend/uploads/ yang TIDAK ada metadatanya
# di tabel `files` (atau metadata sudah dihapus / soft-deleted).
#
# Mode:
#   --dry-run (default)  : hanya tampilkan apa yang akan dihapus, tidak menghapus
#   --apply              : hapus file fisik yang orphan
#
# Syarat:
#   - Variable DB_* di environment harus terisi
#   - Jalankan SEBELUM migrasi atau pembersihan besar
set -euo pipefail

MODE="dry-run"
if [[ "${1:-}" == "--apply" ]]; then
  MODE="apply"
fi

# ── Cek env vars ──
: "${DB_HOST:?DB_HOST wajib diset}"
: "${DB_PORT:?DB_PORT wajib diset}"
: "${DB_NAME:?DB_NAME wajib diset}"
: "${DB_USER:?DB_USER wajib diset}"
: "${DB_PASSWORD:?DB_PASSWORD wajib diset}"

UPLOADS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../backend/uploads" && pwd)"

if [[ ! -d "${UPLOADS_DIR}" ]]; then
  echo "Tidak ada direktori uploads di ${UPLOADS_DIR} — tidak ada yang perlu dibersihkan."
  exit 0
fi

# ── Kumpulkan nama file fisik di uploads (termasuk subdirektori) ──
# Format: <storage_key> relatif dari uploads/
# Contoh: "ab/uuid.pdf"
mapfile -t PHYSICAL < <(
  find "${UPLOADS_DIR}" -type f ! -path '*/_tmp/*' -printf '%P\n' 2>/dev/null || \
  find "${UPLOADS_DIR}" -type f ! -path '*/_tmp/*' | sed "s|^${UPLOADS_DIR}/||"
)

if [[ ${#PHYSICAL[@]} -eq 0 ]]; then
  echo "Tidak ada file fisik di uploads/ — selesai."
  exit 0
fi

# ── Ambil storage_key valid dari database ──
# Hanya file yang aktif (deleted_at IS NULL) dianggap valid.
VALID_KEYS="$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
  -t -A -c "SELECT storage_key FROM files WHERE deleted_at IS NULL;" 2>/dev/null || true)"

# ── Tentukan orphan ──
ORPHANS=()
for key in "${PHYSICAL[@]}"; do
  # Cek apakah key ada di daftar valid
  if ! echo "${VALID_KEYS}" | grep -qxF "${key}"; then
    ORPHANS+=("${key}")
  fi
done

# ── Tampilkan hasil ──
echo "=== Cleanup Orphan Files — mode: ${MODE} ==="
echo ""
echo "Total file fisik di uploads/   : ${#PHYSICAL[@]}"
echo "Total orphan (tidak ada meta) : ${#ORPHANS[@]}"
echo ""

if [[ ${#ORPHANS[@]} -eq 0 ]]; then
  echo "✅ Tidak ada file orphan. Tidak perlu dibersihkan."
  exit 0
fi

# Tampilkan daftar orphan (tanpa isi file)
for key in "${ORPHANS[@]}"; do
  filepath="${UPLOADS_DIR}/${key}"
  if [[ "${MODE}" == "dry-run" ]]; then
    echo "  [DRY] Akan dihapus: ${key}"
  else
    echo "  [APPLY] Menghapus: ${key}"
    if [[ -f "${filepath}" ]]; then
      rm -f "${filepath}"
    fi
  fi
done

# ── Bersihkan direktori kosong (hanya apply mode) ──
if [[ "${MODE}" == "apply" ]]; then
  find "${UPLOADS_DIR}" -type d -empty ! -path "${UPLOADS_DIR}/_tmp*" -delete 2>/dev/null || true
  echo ""
  echo "✅ Selesai. Direktori kosong sudah dibersihkan."
else
  echo ""
  echo "⚠️  Mode dry-run — jalankan dengan --apply untuk menghapus file."
fi
