BEGIN;

-- Deshabilitar RLS en la tabla
ALTER TABLE timeseries.telemetry DISABLE ROW LEVEL SECURITY;

-- Eliminar cualquier política previa de RLS
DROP POLICY IF EXISTS telemetry_tenant_isolation ON timeseries.telemetry;

COMMIT;
