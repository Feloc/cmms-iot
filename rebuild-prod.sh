#!/usr/bin/env bash
set -euo pipefail

# Rebuild and redeploy in production
# Usage:
#   ./rebuild-prod.sh            # rebuild all + restart
#   ./rebuild-prod.sh api        # rebuild only api + restart
#   ./rebuild-prod.sh web        # rebuild only web + restart

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="/srv/cmms-iot/env/.env.production"

if [ "$#" -eq 0 ]; then
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
else
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build "$@"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d "$@"
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
