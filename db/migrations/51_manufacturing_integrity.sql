-- Reconcile checks omitted when tables were previously created by Prisma db push.
-- No business data is rewritten: validation fails explicitly on inconsistent rows.
BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE "ManufacturingQuickProfile" ADD COLUMN IF NOT EXISTS "approvalExceptionReason" text;
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('ManufacturingSiteDeployment', 'values', '"lockVersion" >= 1'),
    ('ManufacturingSiteReceiptCheck', 'values', '"position" >= 1 AND "lockVersion" >= 1'),
    ('ManufacturingSatTemplate', 'values', '"version" >= 1'),
    ('ManufacturingSatTemplateCase', 'values', '"position" >= 1 AND ("minimumValue" IS NULL OR "maximumValue" IS NULL OR "minimumValue" <= "maximumValue")'),
    ('ManufacturingSatExecution', 'values', '"sequence" >= 1 AND "templateVersion" >= 1 AND "lockVersion" >= 1'),
    ('ManufacturingSatCase', 'values', '"position" >= 1 AND "lockVersion" >= 1 AND ("minimumValue" IS NULL OR "maximumValue" IS NULL OR "minimumValue" <= "maximumValue")'),
    ('ManufacturingSatDeviation', 'values', '"sequence" >= 1 AND "lockVersion" >= 1'),
    ('ManufacturingHandover', 'values', '"lockVersion" >= 1'),
    ('ManufacturingHandoverDocument', 'values', '"position" >= 1 AND "lockVersion" >= 1'),
    ('ManufacturingHandoverTraining', 'values', '"durationHours" > 0 AND "attendeeCount" >= 1'),
    ('ManufacturingHandoverSpare', 'values', '"quantity" > 0 AND ("recommendedStock" IS NULL OR "recommendedStock" >= 0)'),
    ('AfterSalesPartDemand', 'values', '"requestedQuantity" > 0 AND "fulfilledQuantity" >= 0 AND "fulfilledQuantity" <= "requestedQuantity" AND "installedQuantity" >= 0 AND "installedQuantity" <= "requestedQuantity" AND "lockVersion" >= 1'),
    ('AfterSalesPartDemand', 'delivery', '"installedQuantity" <= "fulfilledQuantity" AND "directDeliveredQuantity" >= 0 AND "directDeliveredQuantity" <= "fulfilledQuantity"'),
    ('ManufacturingOutputReceipt', 'quantity', '"quantity" > 0'),
    ('ManufacturingOrder', 'executionMode', '"executionMode" IN (''STANDARD'',''EXPEDITED'') AND ("executionMode" <> ''EXPEDITED'' OR "orderType" = ''SPARE_PART'')'),
    ('ServiceOrderPart', 'directIssuedQuantity', '"directIssuedQuantity" >= 0 AND "directIssuedQuantity" <= "qty"')
  ) AS checks(table_name, suffix, expression)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass(format('public.%I', item.table_name)) AND conname = item.table_name || '_' || item.suffix || '_check') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s) NOT VALID', item.table_name, item.table_name || '_' || item.suffix || '_check', item.expression);
    END IF;
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', item.table_name, item.table_name || '_' || item.suffix || '_check');
  END LOOP;
END $$;

DO $$ BEGIN
  ALTER TABLE "ManufacturingQuickProfile" ADD CONSTRAINT "ManufacturingQuickProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingQuickExecution" ADD CONSTRAINT "ManufacturingQuickExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Composite keys prevent tenant-mismatched relations even outside the API.
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryItem_tenantId_id_key" ON "InventoryItem" ("tenantId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingOrder_tenantId_id_key" ON "ManufacturingOrder" ("tenantId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingQuickProfile_tenantId_id_key" ON "ManufacturingQuickProfile" ("tenantId", "id");
DO $$ BEGIN
  ALTER TABLE "ManufacturingQuickProfile" ADD CONSTRAINT "ManufacturingQuickProfile_tenant_item_fkey" FOREIGN KEY ("tenantId", "inventoryItemId") REFERENCES "InventoryItem" ("tenantId", "id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingQuickExecution" ADD CONSTRAINT "ManufacturingQuickExecution_tenant_order_fkey" FOREIGN KEY ("tenantId", "manufacturingOrderId") REFERENCES "ManufacturingOrder" ("tenantId", "id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingQuickExecution" ADD CONSTRAINT "ManufacturingQuickExecution_tenant_profile_fkey" FOREIGN KEY ("tenantId", "profileId") REFERENCES "ManufacturingQuickProfile" ("tenantId", "id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMIT;
