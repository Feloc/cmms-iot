#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/srv/cmms-iot/env/.env.production"

docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d --build
