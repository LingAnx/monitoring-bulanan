#!/usr/bin/env bash
# ============================================================
# make-safe-release.sh (DEPRECATED → build-release.sh)
#
# Script ini TIDAK LAGI digunakan — ia memakai blacklist (rsync
# --exclude) yang terbukti lolos membiarkan artefak seperti
# ZIP rilis lama, file duplikat "* 2.*", dan dump masuk paket.
#
# Gunakan scripts/build-release.sh (allowlist) + audit otomatis
# via scripts/audit-release.py terhadap path ZIP eksplisit.
#
# File ini dipertahankan HANYA sebagai pointer; menjalankan
# script akan menolak dan mengarahkan ke script pengganti.
# ============================================================
set -euo pipefail
echo "GAGAL: make-safe-release.sh tidak lagi digunakan." >&2
echo "  Alasan: metode blacklist (rsync --exclude) terbukti bocor (ZIP lama & duplikat lolos masuk paket)." >&2
echo "  Gunakan: bash scripts/build-release.sh" >&2
echo "    → staging allowlist + audit ZIP final (scripts/audit-release.py <zip>)" >&2
exit 1
