#!/usr/bin/env bash
# Proves tenant isolation against the real schema: loads the Supabase shim,
# supabase/schema.sql and every migration into a fresh database, then runs
# supabase/tests/rls.sql. Needs a Postgres to talk to - locally, or the
# postgres service in CI. Usage: DATABASE_URL=postgres://... scripts/test-rls.sh
set -euo pipefail
export PGOPTIONS="-c client_min_messages=warning"
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to an empty Postgres database (it is wiped)}"
psql() { command psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

psql -c "drop schema if exists public cascade; drop schema if exists auth cascade; drop schema if exists storage cascade; drop schema if exists rls_test cascade; create schema public;" >/dev/null
psql -f supabase/tests/supabase-shim.sql >/dev/null
psql -f supabase/schema.sql >/dev/null

# schema.sql is a snapshot that already includes some early migrations, so
# re-running those reports "already exists" - expected, the same as running
# them twice in the SQL editor. Anything else is a real problem.
errors=$(mktemp)
for f in $(ls supabase/migrations/*.sql | sort); do
  command psql "$DATABASE_URL" -X -q -f "$f" >/dev/null 2>>"$errors" || true
done
if grep ERROR "$errors" | grep -v "already exists" >/dev/null; then
  echo "A migration failed to apply:"; grep ERROR "$errors" | grep -v "already exists"; exit 1
fi

psql -o /dev/null -f supabase/tests/rls.sql
