-- db/migrations/20250924_asset_rls.sql
BEGIN;

-- Activar RLS en Asset
ALTER TABLE "Asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Asset" FORCE ROW LEVEL SECURITY;

-- Índices adicionales
CREATE INDEX IF NOT EXISTS asset_tenant_code_idx ON "Asset"("tenantId", code);
CREATE INDEX IF NOT EXISTS asset_tenant_name_idx ON "Asset"("tenantId", name);
CREATE INDEX IF NOT EXISTS asset_tenant_location_idx ON "Asset"("tenantId", "locationId");

-- Políticas de aislamiento por tenant
DROP POLICY IF EXISTS asset_tenant_isolation ON "Asset";
CREATE POLICY asset_tenant_isolation ON "Asset"
  USING ("tenantId" = current_setting('app.tenant_id', true));

COMMIT;
