#!/usr/bin/env bash
set -euo pipefail

# Restart CMMS-IoT production stack
# Usage:
#   ./restart-prod.sh           # restart all services
#   ./restart-prod.sh api       # restart only api

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="/srv/cmms-iot/env/.env.production"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart "$@"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
