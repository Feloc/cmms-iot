#!/usr/bin/env bash
set -euo pipefail

# Stop CMMS-IoT production stack (containers stay created)
# Usage:
#   ./stop-prod.sh            # stop all services
#   ./stop-prod.sh api        # stop only api

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="/srv/cmms-iot/env/.env.production"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop "$@"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
