#!/usr/bin/env bash
set -euo pipefail

# Backup simple de Postgres (Timescale) usando pg_dump dentro del contenedor.
# Genera un .sql.gz en /srv/cmms-iot/backups

ENV_PATH="${ENV_PATH:-/srv/cmms-iot/env/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-/srv/cmms-iot/backups}"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$ENV_PATH" ]; then
  echo "ERROR: No encuentro $ENV_PATH" >&2
  exit 1
fi

# Carga variables del .env.production
set -a
# shellcheck disable=SC1090
source "$ENV_PATH"
set +a

TS="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/${POSTGRES_DB}_${TS}.sql.gz"

echo "[backup] dumping db=${POSTGRES_DB} -> $OUT"

docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$OUT"

echo "[backup] OK"
