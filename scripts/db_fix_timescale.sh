#!/usr/bin/env bash
set -euo pipefail

echo "Fixing Timescale hypertable and PK on telemetry..."

docker compose exec db psql -U cmms -d cmms -c "ALTER TABLE telemetry DROP CONSTRAINT IF EXISTS telemetry_pkey;" || true

docker compose exec db psql -U cmms -d cmms -c "ALTER TABLE telemetry ADD PRIMARY KEY (tenant_id, asset_code, sensor_type, ts, id);"

docker compose exec db psql -U cmms -d cmms -c "SELECT create_hypertable('telemetry','ts', if_not_exists => TRUE);"

docker compose exec db psql -U cmms -d cmms -c "CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_asset_ts ON telemetry(tenant_id, asset_code, ts DESC);"

docker compose exec db psql -U cmms -d cmms -c "CREATE INDEX IF NOT EXISTS idx_telemetry_sensor_ts ON telemetry(sensor_type, ts DESC);"

docker compose exec db psql -U cmms -d cmms -c "SELECT hypertable_name FROM timescaledb_information.hypertables;"
