
-- attachments migration robust to Prisma table names and id types
-- Supports either snake_case tables (tenants, work_orders, users)
-- or Prisma default CamelCase tables ("Tenant","WorkOrder","User").
-- Uses TEXT ids (cuid) to match common Prisma setups. Adjust if your ids are UUID.

BEGIN;

-- Discover table names
DO $$
DECLARE
  tenants_tbl regclass;
  work_orders_tbl regclass;
  users_tbl regclass;
  q text;
BEGIN
  -- tenants
  BEGIN tenants_tbl := 'tenants'::regclass; EXCEPTION WHEN undefined_table THEN tenants_tbl := '"Tenant"'::regclass; END;
  -- work orders
  BEGIN work_orders_tbl := 'work_orders'::regclass; EXCEPTION WHEN undefined_table THEN work_orders_tbl := '"WorkOrder"'::regclass; END;
  -- users
  BEGIN users_tbl := 'users'::regclass; EXCEPTION WHEN undefined_table THEN users_tbl := '"User"'::regclass; END;

  -- Create table if not exists with dynamic FKs
  q := format($f$
    CREATE TABLE IF NOT EXISTS attachments (
      id          TEXT PRIMARY KEY,
      tenant_id   TEXT NOT NULL,
      work_order_id TEXT NOT NULL,
      type        TEXT NOT NULL,
      filename    TEXT NOT NULL,
      mime_type   TEXT NOT NULL,
      size        INTEGER NOT NULL,
      url         TEXT NOT NULL,
      created_by  TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT attachments_tenant_fk FOREIGN KEY (tenant_id) REFERENCES %s(id) ON DELETE CASCADE,
      CONSTRAINT attachments_wo_fk     FOREIGN KEY (work_order_id) REFERENCES %s(id) ON DELETE CASCADE,
      CONSTRAINT attachments_user_fk   FOREIGN KEY (created_by) REFERENCES %s(id) ON DELETE RESTRICT
    );
  $f$, tenants_tbl::text, work_orders_tbl::text, users_tbl::text);
  EXECUTE q;
END $$;

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_attachments_tenant_wo_created
  ON attachments (tenant_id, work_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachments_tenant_created
  ON attachments (tenant_id, created_at DESC);

-- Enable RLS
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists (PG13+)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'attachments' AND policyname = 'tenant_isolation') THEN
    EXECUTE 'DROP POLICY tenant_isolation ON attachments';
  END IF;
END $$;

-- Create tenant isolation policy using app.tenant_id GUC
CREATE POLICY tenant_isolation ON attachments
  USING (tenant_id = current_setting('app.tenant_id', true));

COMMIT;
