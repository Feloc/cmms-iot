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

# En WSL, el helper "desktop.exe" puede romper buildx al resolver imágenes públicas
# como docker/dockerfile:1.7. Para este script usamos un DOCKER_CONFIG mínimo.
TEMP_DOCKER_CONFIG=""
cleanup() {
  if [ -n "${TEMP_DOCKER_CONFIG}" ] && [ -d "${TEMP_DOCKER_CONFIG}" ]; then
    rm -rf "${TEMP_DOCKER_CONFIG}"
  fi
}
trap cleanup EXIT

if [ -f "${HOME}/.docker/config.json" ] && grep -q '"credsStore"[[:space:]]*:[[:space:]]*"desktop.exe"' "${HOME}/.docker/config.json"; then
  TEMP_DOCKER_CONFIG="$(mktemp -d)"
  printf '{ "auths": {} }\n' > "${TEMP_DOCKER_CONFIG}/config.json"
  export DOCKER_CONFIG="${TEMP_DOCKER_CONFIG}"
  echo "[rebuild-prod] using temporary DOCKER_CONFIG without desktop.exe credsStore"
fi

if [ "$#" -eq 0 ]; then
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
else
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build "$@"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d "$@"
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
