#!/usr/bin/env bash
set -euo pipefail

# Tail logs for CMMS-IoT production stack
# Usage:
#   ./logs-prod.sh            # follow logs for all services
#   ./logs-prod.sh api        # follow logs for api only

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="/srv/cmms-iot/env/.env.production"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f --tail=200 "$@"
