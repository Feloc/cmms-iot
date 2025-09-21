/* CREATE TABLE IF NOT EXISTS attachment (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    type          text NOT NULL CHECK (type IN ('IMAGE','VIDEO','AUDIO','DOCUMENT')),
    filename      text NOT NULL,
    mime_type     text NOT NULL,
    size          integer NOT NULL CHECK (size >= 0),
    storage_key   text NOT NULL,
    url           text NOT NULL,
    created_by    uuid NOT NULL REFERENCES users(id),
    created_at    timestamptz NOT NULL DEFAULT now()
); */

/* CREATE INDEX IF NOT EXISTS idx_attachment_tenant_wo_created
  ON attachment (tenant_id, work_order_id, created_at DESC); */

ALTER TABLE attachment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attachment_tenant_isolation ON attachment;
CREATE POLICY attachment_tenant_isolation ON attachment
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
