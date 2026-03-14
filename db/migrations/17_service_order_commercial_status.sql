DO $$
BEGIN
  CREATE TYPE "public"."ServiceOrderCommercialStatus" AS ENUM (
    'PENDING_QUOTE',
    'PENDING_APPROVAL',
    'APPROVED',
    'CONFIRMED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE IF EXISTS "public"."WorkOrder"
  ADD COLUMN IF NOT EXISTS "commercialStatus" "public"."ServiceOrderCommercialStatus";

CREATE INDEX IF NOT EXISTS "WorkOrder_tenantId_commercialStatus_idx"
  ON "public"."WorkOrder" ("tenantId", "commercialStatus");
