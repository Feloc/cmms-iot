CREATE TABLE IF NOT EXISTS "public"."ServiceOrderCommercialNote" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "workOrderId" text NOT NULL,
  "commercialStatus" "public"."ServiceOrderCommercialStatus",
  "comment" text NOT NULL,
  "eventAt" timestamp(3) without time zone NOT NULL,
  "addedByUserId" text NOT NULL,
  "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "ServiceOrderCommercialNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceOrderCommercialNote_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceOrderCommercialNote_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ServiceOrderCommercialNote_tenantId_workOrderId_eventAt_idx"
  ON "public"."ServiceOrderCommercialNote" ("tenantId", "workOrderId", "eventAt" DESC);

CREATE INDEX IF NOT EXISTS "ServiceOrderCommercialNote_tenantId_addedByUserId_createdAt_idx"
  ON "public"."ServiceOrderCommercialNote" ("tenantId", "addedByUserId", "createdAt" DESC);
