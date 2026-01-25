#!/usr/bin/env bash
set -euo pipefail

# Quick health checks for CMMS-IoT production stack.
# - Shows docker compose status
# - Checks key ports on localhost (assuming your compose publishes them)
#
# Usage:
#   ./health-prod.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="/srv/cmms-iot/env/.env.production"

echo "== docker compose ps =="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo
echo "== port checks (localhost) =="
check_port () {
  local port="$1"
  local name="$2"
  if timeout 1 bash -lc "</dev/tcp/localhost/${port}" >/dev/null 2>&1; then
    echo "[ok] ${name} port ${port} reachable"
  else
    echo "[warn] ${name} port ${port} NOT reachable"
  fi
}

check_port 3000 "web"
check_port 3001 "api"
check_port 1883 "mosquitto"
check_port 5432 "db"

echo
echo "== http checks (best-effort) =="
if command -v curl >/dev/null 2>&1; then
  curl -fsS "http://localhost:3000" >/dev/null && echo "[ok] web http://localhost:3000" || echo "[warn] web http://localhost:3000 failed"
  curl -fsS "http://localhost:3001" >/dev/null && echo "[ok] api http://localhost:3001" || echo "[warn] api http://localhost:3001 failed"
else
  echo "[warn] curl not found; skipping http checks"
fi
