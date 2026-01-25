#!/usr/bin/env bash
set -euo pipefail

# Restore Postgres/Timescale DB from a gzip'd SQL dump created by backup-db.sh.
#
# SAFETY:
#   - Requires --force to actually restore (because it OVERWRITES the DB contents).
#
# Usage:
#   ./restore-db.sh /srv/cmms-iot/backups/cmms_db_YYYYMMDD_HHMMSS.sql.gz --force
#
# Notes:
#   - Ensure `db` container is running.
#   - Ideally stop api/ingest/web before restore.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="/srv/cmms-iot/env/.env.production"

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <backup.sql.gz> --force"
  exit 2
fi

BACKUP_PATH="$1"
FORCE="${2:-}"

if [ "$FORCE" != "--force" ]; then
  echo "[safety] Refusing to restore without --force"
  echo "         This operation overwrites the database."
  echo "Usage: $0 <backup.sql.gz> --force"
  exit 2
fi

if [ ! -f "$BACKUP_PATH" ]; then
  echo "[err] Backup file not found: $BACKUP_PATH"
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
echo "[restore] Restoring... (this may take a while)"

# Feed decompressed SQL to psql in container
gunzip -c "$BACKUP_PATH" | docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
  sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

echo "[restore] Done."
