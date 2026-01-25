#!/usr/bin/env bash
set -euo pipefail

# Safe rebuild for production:
# - Creates a DB backup first
# - Rebuilds specified services (or all if none)
# - Re-deploys those services
#
# Usage:
#   ./rebuild-prod-safe.sh
#   ./rebuild-prod-safe.sh api
#   ./rebuild-prod-safe.sh web
#   ./rebuild-prod-safe.sh ingest

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="/srv/cmms-iot/env/.env.production"

./backup-db.sh

if [ "$#" -eq 0 ]; then
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile mqtt up -d
else
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build "$@"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile mqtt up -d "$@"
fi

./health-prod.sh
