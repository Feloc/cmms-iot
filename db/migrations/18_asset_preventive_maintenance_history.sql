DO $$
BEGIN
  CREATE TYPE "public"."PreventiveMaintenanceSource" AS ENUM (
    'WORK_ORDER',
    'MANUAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "public"."AssetPreventiveMaintenance" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "assetId" text NOT NULL,
  "pmPlanId" text,
  "workOrderId" text,
  "source" "public"."PreventiveMaintenanceSource" NOT NULL DEFAULT 'MANUAL',
  "executedAt" timestamp(3) without time zone NOT NULL,
  "note" text,
  "createdByUserId" text,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetPreventiveMaintenance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssetPreventiveMaintenance_workOrderId_key" UNIQUE ("workOrderId"),
  CONSTRAINT "AssetPreventiveMaintenance_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "AssetPreventiveMaintenance_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "public"."Asset"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "AssetPreventiveMaintenance_pmPlanId_fkey"
    FOREIGN KEY ("pmPlanId") REFERENCES "public"."PmPlan"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "AssetPreventiveMaintenance_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "AssetPreventiveMaintenance_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "AssetPreventiveMaintenance_tenantId_assetId_executedAt_idx"
  ON "public"."AssetPreventiveMaintenance" ("tenantId", "assetId", "executedAt" DESC);

CREATE INDEX IF NOT EXISTS "AssetPreventiveMaintenance_tenantId_pmPlanId_executedAt_idx"
  ON "public"."AssetPreventiveMaintenance" ("tenantId", "pmPlanId", "executedAt" DESC);

CREATE INDEX IF NOT EXISTS "AssetPreventiveMaintenance_tenantId_source_executedAt_idx"
  ON "public"."AssetPreventiveMaintenance" ("tenantId", "source", "executedAt" DESC);
