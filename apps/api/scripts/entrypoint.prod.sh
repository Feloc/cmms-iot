#!/bin/sh
set -eu

echo "[api] Starting production entrypoint..."

APP_ROOT="/app"
PRISMA_SCHEMA_PATH="$APP_ROOT/apps/api/prisma/schema.prisma"
SQL_MIGRATIONS_DIR="$APP_ROOT/db/migrations"
SQL_HISTORY_TABLE='public."SqlMigrationHistory"'

bootstrap_sql_history_if_needed() {
  applied_count="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT COUNT(*) FROM ${SQL_HISTORY_TABLE}")"
  if [ "${applied_count}" != "0" ]; then
    return 0
  fi

  work_order_exists="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT CASE WHEN to_regclass('public.\"WorkOrder\"') IS NULL THEN 0 ELSE 1 END")"
  if [ "${work_order_exists}" != "1" ]; then
    return 0
  fi

  echo "[api] Bootstrapping SQL migration history for existing database"
  for name in \
    00_globals_roles.sql \
    01_extensions.sql \
    02_schemas.sql \
    10_schema_no_privs.sql \
    12_privs_rls.sql \
    13_hourmeter_history.sql \
    14_service_order_issue_tracking.sql \
    15_inventory_unit_price.sql \
    16_asset_maintenance_plan_plan_start_at.sql \
    17_service_order_commercial_status.sql
  do
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO ${SQL_HISTORY_TABLE} (name) VALUES ('${name}') ON CONFLICT (name) DO NOTHING" >/dev/null
  done
}

run_sql_migrations() {
  if [ ! -d "$SQL_MIGRATIONS_DIR" ]; then
    echo "[api] No SQL migrations directory found"
    return 0
  fi

  echo "[api] Ensuring SQL migration history table"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS public."SqlMigrationHistory" (
  name text PRIMARY KEY,
  appliedAt timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SQL

  bootstrap_sql_history_if_needed

  find "$SQL_MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort | while read -r file; do
    name="$(basename "$file")"
    already_applied="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT 1 FROM ${SQL_HISTORY_TABLE} WHERE name = '${name}' LIMIT 1")"
    if [ "${already_applied}" = "1" ]; then
      echo "[api] SQL migration already applied: ${name}"
      continue
    fi

    echo "[api] Applying SQL migration: ${name}"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO ${SQL_HISTORY_TABLE} (name) VALUES ('${name}')" >/dev/null
  done
}

cd "$APP_ROOT"

# Ensure Prisma client exists (should be generated during npm ci)
# Apply schema:
# - If migrations exist -> migrate deploy
# - Otherwise -> db push (useful for first internal pilot)
if [ -d "$APP_ROOT/apps/api/prisma/migrations" ] && [ "$(ls -A "$APP_ROOT/apps/api/prisma/migrations" 2>/dev/null)" ]; then
  echo "[api] prisma migrate deploy"
  npx prisma migrate deploy --schema "$PRISMA_SCHEMA_PATH"
else
  echo "[api] prisma db push (no migrations found)"
  npx prisma db push --accept-data-loss --schema "$PRISMA_SCHEMA_PATH"
fi

run_sql_migrations

echo "[api] Starting NestJS"
exec node "$APP_ROOT/apps/api/dist/main.js"
