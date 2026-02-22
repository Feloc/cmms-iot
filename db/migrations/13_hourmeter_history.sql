DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MeterType') THEN
    CREATE TYPE "public"."MeterType" AS ENUM ('HOURMETER');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MeterReadingSource') THEN
    CREATE TYPE "public"."MeterReadingSource" AS ENUM ('MANUAL_OS', 'IOT', 'IMPORT', 'ADJUSTMENT');
  END IF;
END
$$;

ALTER TABLE "public"."Asset"
  ADD COLUMN IF NOT EXISTS "latestHourmeter" double precision,
  ADD COLUMN IF NOT EXISTS "latestHourmeterAt" timestamp(3) without time zone;

CREATE TABLE IF NOT EXISTS "public"."AssetMeterReading" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "assetId" text NOT NULL,
  "workOrderId" text,
  "meterType" "public"."MeterType" NOT NULL DEFAULT 'HOURMETER',
  "source" "public"."MeterReadingSource" NOT NULL DEFAULT 'MANUAL_OS',
  "phase" "public"."MeasurementPhase" NOT NULL DEFAULT 'OTHER',
  "reading" double precision NOT NULL,
  "readingAt" timestamp(3) without time zone NOT NULL,
  "note" text,
  "deltaFromPrevious" double precision,
  "createdByUserId" text,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) without time zone NOT NULL,
  CONSTRAINT "AssetMeterReading_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssetMeterReading_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetMeterReading_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssetMeterReading_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AssetMeterReading_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AssetMeterReading_tenant_asset_readingAt_idx"
  ON "public"."AssetMeterReading"("tenantId", "assetId", "readingAt" DESC);

CREATE INDEX IF NOT EXISTS "AssetMeterReading_tenant_workOrder_idx"
  ON "public"."AssetMeterReading"("tenantId", "workOrderId");

CREATE INDEX IF NOT EXISTS "AssetMeterReading_tenant_meterType_readingAt_idx"
  ON "public"."AssetMeterReading"("tenantId", "meterType", "readingAt" DESC);
