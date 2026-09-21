#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${SQL_MIGRATIONS_DIR:?SQL_MIGRATIONS_DIR is required}"
[ -d "$SQL_MIGRATIONS_DIR" ] || { echo 'Missing SQL migration directory' >&2; exit 1; }
PSQL_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&/\1/g; s/[?&]schema=[^&]*$//g; s/\?&/\?/g; s/[?]$//g')"
# START is used only for an explicitly scoped reconciliation, never inferred.
MIGRATION_START="${MIGRATION_START:-00}"
case "$MIGRATION_START" in [0-9][0-9]) ;; *) echo 'Invalid MIGRATION_START' >&2; exit 1;; esac
# Materialize the SQL first: POSIX sh pipelines otherwise hide a generator
# failure behind a successful psql exit code.
MIGRATION_SQL_FILE="$(mktemp /tmp/cmms-sql-migrations.XXXXXX)"
trap 'rm -f "$MIGRATION_SQL_FILE"' EXIT HUP INT TERM
set -- "$SQL_MIGRATIONS_DIR"/*.sql
[ -f "$1" ] || { echo 'No SQL migrations found' >&2; exit 1; }
{
  printf '%s\n' "SELECT pg_advisory_lock(742003351);"
  printf '%s\n' 'CREATE TABLE IF NOT EXISTS public."SqlMigrationHistory" (name text PRIMARY KEY, "appliedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);'
  printf '%s\n' 'ALTER TABLE public."SqlMigrationHistory" ADD COLUMN IF NOT EXISTS checksum text;'
  if [ "$MIGRATION_START" = '00' ]; then
    printf '%s\n' 'DO $$ BEGIN IF to_regclass('\''public."WorkOrder"'\'') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."SqlMigrationHistory" WHERE name = '\''10_schema_no_privs.sql'\'') THEN RAISE EXCEPTION '\''Existing schema has no verified baseline. Reconcile migration history before deployment; db push is disabled.'\''; END IF; END $$;'
  fi
  for file in "$SQL_MIGRATIONS_DIR"/*.sql; do
    name="$(basename "$file")"
    case "$name" in *[!a-zA-Z0-9_.-]*) echo 'Invalid migration filename' >&2; exit 1;; esac
    number="$(printf '%s' "$name" | cut -c1-2)"
    case "$number" in [0-9][0-9]) ;; *) echo 'Invalid migration sequence' >&2; exit 1;; esac
    [ "$number" -ge "$MIGRATION_START" ] || continue
    checksum="$(sha256sum "$file" | cut -d' ' -f1)"
    printf "SELECT EXISTS (SELECT 1 FROM public.\"SqlMigrationHistory\" WHERE name='%s') AS applied \\gset\n" "$name"
    printf '%s\n' '\if :applied'
    printf "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM public.\"SqlMigrationHistory\" WHERE name='%s' AND checksum IS NOT NULL AND checksum <> '%s') THEN RAISE EXCEPTION 'Applied migration checksum mismatch: %s'; END IF; END \$\$;\n" "$name" "$checksum" "$name"
    printf '%s\n' '\else'
    # Enum additions in older migrations must commit before their first use.
    # Files are retryable; reconciliation 51 validates all omitted checks.
    printf '\\echo Applying %s\n' "$name"
    printf '\\i %s\n' "$file"
    printf "INSERT INTO public.\"SqlMigrationHistory\" (name, checksum) VALUES ('%s','%s');\n" "$name" "$checksum"
    printf '%s\n' '\endif'
  done
  printf '%s\n' 'SELECT pg_advisory_unlock(742003351);'
} > "$MIGRATION_SQL_FILE"
psql "$PSQL_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION_SQL_FILE"
