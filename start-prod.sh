#!/usr/bin/env bash
set -euo pipefail

# Start CMMS-IoT production stack (Docker Compose)
# Usage:
#   ./start-prod.sh            # start all services
#   ./start-prod.sh api web    # start only specific services

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="/srv/cmms-iot/env/.env.production"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d "$@"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
