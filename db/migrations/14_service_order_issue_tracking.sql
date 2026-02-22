DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceOrderIssueStatus') THEN
    CREATE TYPE "public"."ServiceOrderIssueStatus" AS ENUM (
      'OPEN',
      'IN_PROGRESS',
      'WAITING_PARTS',
      'RESOLVED',
      'VERIFIED',
      'CANCELED'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "public"."ServiceOrderIssue" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "workOrderId" text NOT NULL,
  "status" "public"."ServiceOrderIssueStatus" NOT NULL DEFAULT 'OPEN',
  "openedAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openedByUserId" text,
  "ownerUserId" text,
  "targetResolutionAt" timestamp(3) without time zone,
  "lastFollowUpAt" timestamp(3) without time zone,
  "followUpNote" text,
  "resolutionSummary" text,
  "resolutionWorkOrderId" text,
  "resolvedAt" timestamp(3) without time zone,
  "resolvedByUserId" text,
  "verifiedAt" timestamp(3) without time zone,
  "verifiedByUserId" text,
  "verificationNotes" text,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) without time zone NOT NULL,
  CONSTRAINT "ServiceOrderIssue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceOrderIssue_workOrderId_key" UNIQUE ("workOrderId"),
  CONSTRAINT "ServiceOrderIssue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceOrderIssue_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceOrderIssue_resolutionWorkOrderId_fkey" FOREIGN KEY ("resolutionWorkOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ServiceOrderIssue_tenant_status_updatedAt_idx"
  ON "public"."ServiceOrderIssue"("tenantId", "status", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "ServiceOrderIssue_tenant_owner_status_idx"
  ON "public"."ServiceOrderIssue"("tenantId", "ownerUserId", "status");

CREATE INDEX IF NOT EXISTS "ServiceOrderIssue_tenant_resolutionWorkOrderId_idx"
  ON "public"."ServiceOrderIssue"("tenantId", "resolutionWorkOrderId");
