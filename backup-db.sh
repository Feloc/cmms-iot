#!/usr/bin/env bash
set -euo pipefail

# Backup Postgres/Timescale DB from the running `db` service.
# Creates gzip'd dumps under /srv/cmms-iot/backups
#
# Usage:
#   ./backup-db.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="/srv/cmms-iot/env/.env.production"
BACKUP_DIR="/srv/cmms-iot/backups"

mkdir -p "$BACKUP_DIR"
ts="$(date +%Y%m%d_%H%M%S)"
out="$BACKUP_DIR/cmms_db_${ts}.sql.gz"

echo "[backup] Writing: $out"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' \
  | gzip -c > "$out"

echo "[backup] Done."
ls -lh "$out"
