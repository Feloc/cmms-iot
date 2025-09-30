-- Crear roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cmms_ingest') THEN
    CREATE ROLE cmms_ingest LOGIN PASSWORD 'ingest_secret';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cmms_app') THEN
    CREATE ROLE cmms_app LOGIN PASSWORD 'app_secret';
  END IF;
END
$$;

-- Permisos para ingestión (solo escritura en tabla cruda)
GRANT USAGE ON SCHEMA timeseries TO cmms_ingest;
GRANT INSERT ON timeseries.telemetry TO cmms_ingest;

-- Permisos para app (solo lectura en vistas seguras)
GRANT USAGE ON SCHEMA timeseries TO cmms_app;
GRANT SELECT ON timeseries.v_telemetry, timeseries.v_telemetry_5m TO cmms_app;

-- Revocar accesos directos a la tabla/cagg
REVOKE ALL ON timeseries.telemetry FROM PUBLIC;
REVOKE ALL ON timeseries.telemetry_5m FROM PUBLIC;
