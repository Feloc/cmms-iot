#!/usr/bin/env bash
set -euo pipefail

# Script de deploy simple (interno). Pensado para ejecutarse en el servidor.
#
# Uso:
#   cd /srv/cmms-iot/app/cmms-iot
#   bash scripts/deploy_prod.sh

ENV_PATH="${ENV_PATH:-/srv/cmms-iot/env/.env.production}"

if [ ! -f "$ENV_PATH" ]; then
  echo "ERROR: No encuentro $ENV_PATH" >&2
  exit 1
fi

# Pull si es repo git
if [ -d .git ]; then
  echo "[deploy] git pull"
  git pull --rebase
fi

echo "[deploy] docker compose up -d --build"
docker compose -f docker-compose.prod.yml --env-file "$ENV_PATH" up -d --build

echo "[deploy] status"
docker compose -f docker-compose.prod.yml ps
