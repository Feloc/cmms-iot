BEGIN;

-- 0) Extensiones y schema
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE SCHEMA IF NOT EXISTS timeseries;

-- 1) Tabla base
CREATE TABLE IF NOT EXISTS timeseries.telemetry (
  tenant_id     text        NOT NULL,
  device_id     text        NOT NULL,
  ts            timestamptz NOT NULL,
  metric        text        NOT NULL,
  value_double  double precision NULL,
  value_bool    boolean NULL,
  value_text    text NULL,
  unit          text NULL,
  quality       text NULL,
  attrs         jsonb NULL,
  PRIMARY KEY (tenant_id, device_id, ts, metric)
);

-- 2) Hypertable
SELECT create_hypertable('timeseries.telemetry', 'ts',
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists => TRUE);

-- 3) Índices
CREATE INDEX IF NOT EXISTS idx_tel_tenant_metric_ts
  ON timeseries.telemetry (tenant_id, metric, ts DESC);
CREATE INDEX IF NOT EXISTS idx_tel_tenant_device_ts
  ON timeseries.telemetry (tenant_id, device_id, ts DESC);

-- 4) Retención (ejemplo: mantener solo 180 días)
SELECT add_retention_policy('timeseries.telemetry', INTERVAL '180 days', if_not_exists => TRUE);

COMMIT;
