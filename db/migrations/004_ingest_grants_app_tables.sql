-- Permisos para que el rol cmms_ingest pueda operar con tablas de app usadas por el servicio
-- (usa el mismo rol que diste de alta en 003_grants_roles.sql)
/* 
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cmms_ingest') THEN
    RAISE EXCEPTION 'Role cmms_ingest no existe. Crea el rol antes de aplicar este script.';
  END IF;
END $$; */

-- SELECT sobre Device y Rule
GRANT CONNECT ON DATABASE cmms TO cmms_ingest;
GRANT USAGE ON SCHEMA public TO cmms_ingest;
GRANT SELECT ON TABLE public."Device" TO cmms_ingest;
GRANT SELECT ON TABLE public."Rule"   TO cmms_ingest;
GRANT SELECT ON TABLE public."Tenant" TO cmms_ingest;

-- INSERT/UPDATE sobre RuleState y AssetEvent (ids son TEXT/cuid generados en la app)
--GRANT INSERT, UPDATE ON TABLE public."RuleState"  TO cmms_ingest;
--GRANT INSERT, UPDATE ON TABLE public."AssetEvent" TO cmms_ingest;

-- UPDATE de Device.lastSeen/status por mensajes de state
--GRANT UPDATE ("lastSeen", "status") ON public."Device" TO cmms_ingest;
