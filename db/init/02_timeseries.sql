-- 02_timeseries.sql
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 1) Esquema y dueño
CREATE SCHEMA IF NOT EXISTS timeseries AUTHORIZATION cmms;
ALTER SCHEMA timeseries OWNER TO cmms;
GRANT USAGE ON SCHEMA timeseries TO cmms;

-- 2) Tabla de series temporales (sin identity, PK compuesta)
CREATE TABLE IF NOT EXISTS timeseries.telemetry (
  tenant_id   TEXT NOT NULL,
  asset_code  TEXT NOT NULL,
  sensor_type TEXT NOT NULL,
  ts          TIMESTAMPTZ NOT NULL,
  value       DOUBLE PRECISION NOT NULL,
  meta        JSONB DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, asset_code, sensor_type, ts)
);

-- 3) Hypertable
SELECT create_hypertable('timeseries.telemetry','ts', if_not_exists => TRUE);

-- 4) Índices
CREATE INDEX IF NOT EXISTS idx_ts_tenant_asset_ts ON timeseries.telemetry(tenant_id, asset_code, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ts_sensor_ts       ON timeseries.telemetry(sensor_type, ts DESC);

-- 5) Privilegios
ALTER TABLE timeseries.telemetry OWNER TO cmms;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA timeseries TO cmms;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA timeseries TO cmms;

-- (Opcional) Compresión + retención
-- ALTER TABLE timeseries.telemetry SET (
--   timescaledb.compress,
--   timescaledb.compress_orderby = 'ts DESC',
--   timescaledb.compress_segmentby = 'tenant_id, asset_code, sensor_type'
-- );
-- SELECT add_compression_policy('timeseries.telemetry', INTERVAL '7 days');
-- SELECT add_retention_policy('timeseries.telemetry',  INTERVAL '365 days');
