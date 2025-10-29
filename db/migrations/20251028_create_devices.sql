BEGIN;

CREATE TABLE IF NOT EXISTS "Device" (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantId     TEXT NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
  assetId      TEXT REFERENCES "Asset"(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  code          TEXT UNIQUE NOT NULL,
  model         TEXT,
  manufacturer  TEXT,
  description   TEXT,
  ingest_key    TEXT UNIQUE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ACTIVE',
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_tenant_asset ON "Device"("tenantId", "assetId");

-- RLS: aislamiento multi-tenant
ALTER TABLE "Device" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_tenant_isolation_all ON "Device";
CREATE POLICY device_tenant_isolation_all
  ON "Device"
  USING ("tenantId" = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS device_tenant_insert_check ON "Device";
CREATE POLICY device_tenant_insert_check
  ON "Device"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

COMMIT;
