#!/usr/bin/env bash
set -euo pipefail

# Start CMMS-IoT production stack in a safe order with waits.
#
# Usage:
#   ./start-prod-ordered.sh
#
# Order:
#   db -> wait 5432
#   mosquitto -> wait 1883
#   api -> wait 3001
#   ingest
#   web -> wait 3000

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="/srv/cmms-iot/env/.env.production"

source ./wait-for.sh

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d db
wait_for_tcp "localhost" 5432 "Postgres/TimescaleDB" 90

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile mqtt up -d mosquitto
wait_for_tcp "localhost" 1883 "Mosquitto MQTT" 60

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d api
wait_for_tcp "localhost" 3001 "API" 90

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile mqtt up -d ingest

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d web
wait_for_tcp "localhost" 3000 "Web" 90

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile mqtt ps
