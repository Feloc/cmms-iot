#!/bin/sh
set -eu

APP_ROOT="/app"
SQL_MIGRATIONS_DIR="$APP_ROOT/db/migrations"
export SQL_MIGRATIONS_DIR
# SQL is the sole source of production schema changes. Missing migration history
# is an actionable deployment error, never a reason to run db push.
sh "$APP_ROOT/apps/api/scripts/run-sql-migrations.sh"
echo "[api] Starting NestJS"
exec node "$APP_ROOT/apps/api/dist/main.js"
