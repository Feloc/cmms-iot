#!/usr/bin/env bash
set -euo pipefail

# Uso:
#   sudo bash scripts/server_setup.sh               # usa /srv/cmms-iot
#   sudo bash scripts/server_setup.sh /srv/miapp    # ruta personalizada

BASE="${1:-/srv/cmms-iot}"

mkdir -p "$BASE"/{app,env,data,logs}
mkdir -p "$BASE"/data/{postgres,attachments,uploads}
mkdir -p "$BASE"/data/mosquitto/{config,data}
mkdir -p "$BASE"/logs/mosquitto

cat <<EOF
OK ✅ Estructura creada:
  - Código:      $BASE/app
  - Variables:   $BASE/env/.env.production
  - Postgres:    $BASE/data/postgres
  - Archivos:    $BASE/data/{attachments,uploads}
  - Mosquitto:   $BASE/data/mosquitto (opcional)

Siguiente:
  1) Copia/clone tu repo a $BASE/app
  2) Crea $BASE/env/.env.production
  3) Levanta con: docker compose -f docker-compose.prod.yml --env-file $BASE/env/.env.production up -d --build
EOF
