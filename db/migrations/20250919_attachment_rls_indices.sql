BEGIN;

CREATE INDEX IF NOT EXISTS "idx_Attachment_tenant_workorder_createdAt"
  ON "Attachment" ("tenantId", "workOrderId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_Attachment_tenant_id"
  ON "Attachment" ("tenantId", "id");

ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attachment" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attachment_tenant_isolation_all" ON "Attachment";
DROP POLICY IF EXISTS "attachment_tenant_insert_check" ON "Attachment";
DROP POLICY IF EXISTS "attachment_tenant_all" ON "Attachment";

CREATE POLICY "attachment_tenant_all" ON "Attachment"
  FOR ALL
  TO PUBLIC
  USING (("tenantId")::text = current_setting('app.tenant_id', true))
  WITH CHECK (("tenantId")::text = current_setting('app.tenant_id', true));

COMMIT;
