-- TimescaleDB: schema dedicado, hypertable, índices, CAGG, compresión, retención, RLS, grants
BEGIN;

-- 0) Extensiones y schema
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE SCHEMA IF NOT EXISTS timeseries;

-- 1) Tabla base (narrow)
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

-- 2) Hypertable (chunk 1 día)
SELECT create_hypertable('timeseries.telemetry', 'ts',
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists => TRUE);

-- 3) Índices de consulta
CREATE INDEX IF NOT EXISTS idx_tel_tenant_metric_ts
  ON timeseries.telemetry (tenant_id, metric, ts DESC);
CREATE INDEX IF NOT EXISTS idx_tel_tenant_device_ts
  ON timeseries.telemetry (tenant_id, device_id, ts DESC);

-- 4) Continuous aggregate (5m) - debe ir antes de compresión
CREATE MATERIALIZED VIEW IF NOT EXISTS timeseries.telemetry_5m
WITH (timescaledb.continuous) AS
SELECT
  tenant_id,
  device_id,
  metric,
  time_bucket(INTERVAL '5 minutes', ts) AS bucket,
  count(*)               AS n,
  min(value_double)      AS v_min,
  max(value_double)      AS v_max,
  avg(value_double)      AS v_avg,
  last(value_double, ts) AS v_last
FROM timeseries.telemetry
WHERE value_double IS NOT NULL
GROUP BY tenant_id, device_id, metric, bucket;

CREATE INDEX IF NOT EXISTS idx_tel5m_tenant_metric_bucket
  ON timeseries.telemetry_5m (tenant_id, device_id, metric, bucket DESC);

SELECT add_continuous_aggregate_policy('timeseries.telemetry_5m',
  start_offset => INTERVAL '7 days',
  end_offset   => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');

-- 5) Compresión + retención (después del CAGG)
ALTER TABLE timeseries.telemetry
  SET (timescaledb.compress,
       timescaledb.compress_segmentby = 'tenant_id, device_id, metric',
       timescaledb.compress_orderby   = 'ts DESC');

SELECT add_compression_policy('timeseries.telemetry', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('timeseries.telemetry',   INTERVAL '180 days', if_not_exists => TRUE);

-- 6) RLS por tenant
ALTER TABLE timeseries.telemetry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS telemetry_tenant_isolation ON timeseries.telemetry;
CREATE POLICY telemetry_tenant_isolation ON timeseries.telemetry
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- 7) (Opcional) Grants al rol/app user
-- GRANT USAGE ON SCHEMA timeseries TO cmms;
-- GRANT SELECT, INSERT, DELETE, UPDATE ON timeseries.telemetry TO cmms;
-- GRANT SELECT ON timeseries.telemetry_5m TO cmms;

COMMIT;
