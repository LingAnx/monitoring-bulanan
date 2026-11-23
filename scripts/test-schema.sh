#!/usr/bin/env bash
export PATH="/opt/homebrew/bin:$PATH"
cd "/Users/nafanraiisbanisa/Documents/project/monitoring bulanan"
TESTDB="ksop_schema_test_$(date +%s)"
DB_USER=$(whoami)
echo "Test DB: $TESTDB  (user: $DB_USER)"

psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $TESTDB;" 2>&1 | tail -1

echo "=== schema.sql ==="
if psql -U "$DB_USER" -d "$TESTDB" -f backend/db/schema.sql 2>&1 | grep -qiE "^ERROR|fatal"; then
  echo "  ❌ schema.sql FAILED"
else
  echo "  ✅ schema.sql OK"
fi

echo "=== migrations ==="
ERRS=0
for f in backend/db/migrations/*.sql; do
  OUT=$(psql -U "$DB_USER" -d "$TESTDB" -f "$f" 2>&1)
  if echo "$OUT" | grep -qiE "^ERROR|fatal"; then
    echo "  ❌ $f: $(echo "$OUT" | grep -iE 'ERROR|fatal' | head -1)"
    ERRS=$((ERRS+1))
  else
    echo "  ✅ $f"
  fi
done
echo "Migrations with errors: $ERRS"

echo "=== tables in test DB ==="
psql -U "$DB_USER" -d "$TESTDB" -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"

echo "=== must_change_password column ==="
psql -U "$DB_USER" -d "$TESTDB" -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='must_change_password';"

echo "=== cleanup ==="
psql -U "$DB_USER" -d postgres -c "DROP DATABASE $TESTDB;" 2>&1 | tail -1
echo "Done."
