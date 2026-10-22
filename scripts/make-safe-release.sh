#!/usr/bin/env bash
# ============================================================
# make-safe-release.sh
# Membuat paket distribusi ZIP yang sanitasi:
#   - TIDAK memuat .git, .env, secret, dump data, uploads, logs
#   - TIDAK memuat node_modules, backup, .DS_Store, __MACOSX
#   - MEMATU membawa source, schema/migration, .env.example, lockfile, docs
#
# Usage:
#   cd "monitoring bulanan"
#   bash scripts/make-safe-release.sh
#
# Output: monitoring-bulanan-safe-release.zip di direktori project root
# ============================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_NAME="monitoring-bulanan-safe-release"
RELEASE_DIR="${PROJECT_ROOT}/release-staging"
OUTPUT_ZIP="${PROJECT_ROOT}/${RELEASE_NAME}.zip"

echo "=== Membuat paket distribusi aman ==="
echo "Project root : $PROJECT_ROOT"
echo "Staging dir  : $RELEASE_DIR"
echo "Output       : $OUTPUT_ZIP"

# ── Bersihkan staging lama ───────────────────────────────────
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# ── Salin file source (tanpa artefak sensitif) ───────────────
# Pola include: salin seluruh isi project kecuali pola exclude
# .env: exclude semua .env* lalu include hanya .env.example
# dump data nyata (bukan migration/schema aman)
rsync -av \
  --exclude='.git' \
  --exclude='*.dump' \
  --exclude='*.backup' \
  --exclude='.DS_Store' \
  --exclude='__MACOSX' \
  --exclude='node_modules' \
  --exclude='backend/uploads' \
  --exclude='backend/logs' \
  --exclude='backend/private' \
  --exclude='*.log' \
  --exclude='.env' \
  --exclude='ksop_laporan_v1_stable.sql' \
  --exclude='release-staging' \
  --exclude="monitoring-bulanan-safe-release.zip" \
  "$PROJECT_ROOT/" \
  "$RELEASE_DIR/"

# Salin .env.example secara eksplisit (diputus oleh --exclude='.env' di atas)
if [ -f "$PROJECT_ROOT/backend/.env.example" ]; then
  cp "$PROJECT_ROOT/backend/.env.example" "$RELEASE_DIR/backend/.env.example"
  echo "  ℹ️  .env.example disalin secara eksplisit ke staging."
fi

echo "=== Verifikasi isi staging (audit) ==="

# Audit: pastikan tidak ada file sensitif
SENSITIVE_FILES=$(find "$RELEASE_DIR" \
  \( -name '.env' -o -name '.env.prod' -o -name '*.dump' \
     -o -name '*.backup' -o -name '.DS_Store' -o -name '__MACOSX' \
     -o -name 'node_modules' -o -name 'uploads' -o -name 'logs' \
     -o -name 'private' -o -name '.git' \) 2>/dev/null || true)

if [ -n "$SENSITIVE_FILES" ]; then
  echo "❌ GAGAL: File sensitif ditemukan di staging:"
  echo "$SENSITIVE_FILES"
  exit 1
fi
echo "  ✅ Tidak ada file sensitif di staging."

# Audit: pastikan file wajib ada
REQUIRED_FILES=(
  "$RELEASE_DIR/backend/.env.example"
  "$RELEASE_DIR/backend/db/schema.sql"
  "$RELEASE_DIR/backend/package.json"
  "$RELEASE_DIR/backend/package-lock.json"
  "$RELEASE_DIR/backend/server.js"
  "$RELEASE_DIR/backend/scripts/security-check.js"
  "$RELEASE_DIR/backend/tests/test-jwt-rotation.js"
  "$RELEASE_DIR/backend/db/migrations/005_add_must_change_password.sql"
  "$RELEASE_DIR/backend/docs/db-credentials.md"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  ⚠��  FILE WAJIB HILANG: $f"
  else
    echo "  ✅ Ada: $f"
  fi
done

# ── Buat ZIP ─────────────────────────────────────────────────
rm -f "$OUTPUT_ZIP"
cd "$RELEASE_DIR"
zip -qr "$OUTPUT_ZIP" .

echo ""
echo "=== Audit isi ZIP final ==="
ZIP_CONTENTS=$(unzip -l "$OUTPUT_ZIP" 2>/dev/null || python3 -c "import zipfile; z=zipfile.ZipFile('$OUTPUT_ZIP'); [print(i.filename) for i in z.infolist()]")
SENSITIVE_ZIP=$(echo "$ZIP_CONTENTS" | grep -E '\.env(?!\.example)|\.git/|node_modules|uploads/|logs/|\.DS_Store|__MACOSX|\.dump$|\.backup$' || true)

if [ -n "$SENSITIVE_ZIP" ]; then
  echo "❌ GAGAL: Artefak sensitif ditemukan di ZIP:"
  echo "$SENSITIVE_ZIP"
  exit 1
fi
echo "  ✅ ZIP bersih: tidak ada .env, .git, node_modules, uploads, logs, .DS_Store, __MACOSX, *.dump, *.backup"

# Bersihkan staging
rm -rf "$RELEASE_DIR"

FILE_COUNT=$(unzip -l "$OUTPUT_ZIP" 2>/dev/null | tail -1 | awk '{print $2}' || echo "?")
echo ""
echo "✅ Paket distribusi aman dibuat: $OUTPUT_ZIP"
echo "   Jumlah file dalam paket: $FILE_COUNT"
