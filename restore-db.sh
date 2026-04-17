#!/usr/bin/env bash
set -euo pipefail

# Restore Postgres/Timescale DB from a gzip'd SQL dump created by backup-db.sh.
#
# SAFETY:
#   - Requires --force to actually restore (because it OVERWRITES the DB contents).
#   - By default, drops and recreates the target DB before restore to avoid
#     conflicts with existing schemas/tables/extensions.
#
# Usage:
#   ./restore-db.sh /srv/cmms-iot/backups/cmms_db_YYYYMMDD_HHMMSS.sql.gz --force
#   ./restore-db.sh /srv/cmms-iot/backups/cmms_db_YYYYMMDD_HHMMSS.sql.gz --force --no-reset-db
#
# Notes:
#   - Ensure `db` container is running.
#   - Ideally stop api/ingest/web before restore.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="/srv/cmms-iot/env/.env.production"
RESET_DB=1

usage() {
  echo "Usage: $0 <backup.sql.gz> --force [--no-reset-db]"
}

if [ "$#" -lt 1 ]; then
  usage
  exit 2
fi

BACKUP_PATH="$1"
shift
FORCE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --force)
      FORCE=1
      ;;
    --no-reset-db)
      RESET_DB=0
      ;;
    *)
      echo "[err] Unknown argument: $1"
      usage
      exit 2
      ;;
  esac
  shift
done

if [ "$FORCE" -ne 1 ]; then
  echo "[safety] Refusing to restore without --force"
  echo "         This operation overwrites the database."
  usage
  exit 2
fi

if [ ! -f "$BACKUP_PATH" ]; then
  echo "[err] Backup file not found: $BACKUP_PATH"
  exit 1
fi

if ! gzip -t "$BACKUP_PATH" >/dev/null 2>&1; then
  echo "[err] Backup file is not a valid gzip archive: $BACKUP_PATH"
  exit 1
fi

echo "[restore] Backup: $BACKUP_PATH"
echo "[restore] Checking db container..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps db >/dev/null

# Read DB and user from container env (source of truth)
DB_NAME="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db sh -lc 'printf "%s" "$POSTGRES_DB"')"
DB_USER="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db sh -lc 'printf "%s" "$POSTGRES_USER"')"

echo "[restore] Target DB: $DB_NAME"
echo "[restore] User: $DB_USER"
echo "[restore] Reset DB before restore: $([ "$RESET_DB" -eq 1 ] && echo yes || echo no)"

if [ "$RESET_DB" -eq 1 ]; then
  echo "[restore] Dropping and recreating target DB..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db sh -lc "
    psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d postgres <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '\$POSTGRES_DB'
  AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS \"\$POSTGRES_DB\" WITH (FORCE);
CREATE DATABASE \"\$POSTGRES_DB\" OWNER \"\$POSTGRES_USER\";
SQL
  "
fi

echo "[restore] Restoring... (this may take a while)"

# Feed decompressed SQL to psql in container
gunzip -c "$BACKUP_PATH" | docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
  sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

echo "[restore] Done."
