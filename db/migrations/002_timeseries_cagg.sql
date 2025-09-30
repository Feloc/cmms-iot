-- 1) Continuous aggregate (5m)
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

-- 2) Política de refresco automático
SELECT add_continuous_aggregate_policy('timeseries.telemetry_5m',
  start_offset => INTERVAL '7 days',
  end_offset   => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');

-- 3) Vistas seguras por tenant
CREATE OR REPLACE VIEW timeseries.v_telemetry AS
SELECT *
FROM timeseries.telemetry
WHERE tenant_id = current_setting('app.tenant_id', true);

CREATE OR REPLACE VIEW timeseries.v_telemetry_5m AS
SELECT *
FROM timeseries.telemetry_5m
WHERE tenant_id = current_setting('app.tenant_id', true);

ALTER VIEW timeseries.v_telemetry SET (security_barrier = true);
ALTER VIEW timeseries.v_telemetry_5m SET (security_barrier = true);
