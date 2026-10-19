#!/usr/bin/env bash
# Apply migrations using direct Postgres connection.
# Requires SUPABASE_DB_PASSWORD from Project Settings → Database.
# The API secret key alone cannot run DDL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REF="mstxntgpjlczxjivibeb"
: "${SUPABASE_DB_PASSWORD:?Set SUPABASE_DB_PASSWORD from Supabase Dashboard → Project Settings → Database}"

HOST="${SUPABASE_DB_HOST:-db.${REF}.supabase.co}"
PORT="${SUPABASE_DB_PORT:-5432}"
USER="${SUPABASE_DB_USER:-postgres}"
DB="${SUPABASE_DB_NAME:-postgres}"

export PGPASSWORD="$SUPABASE_DB_PASSWORD"
URI="postgresql://${USER}@${HOST}:${PORT}/${DB}?sslmode=require"

echo "Applying ALL_MIGRATIONS.sql to $HOST ..."
psql "$URI" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/ALL_MIGRATIONS.sql"
echo "Done. Verifying..."
psql "$URI" -c "\dt public.*"
