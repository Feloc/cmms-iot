BEGIN;
CREATE TABLE IF NOT EXISTS "EngineeringRequest" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL REFERENCES "Tenant"("id"),
  "number" text NOT NULL, "assetId" text NOT NULL REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "assetSnapshot" jsonb NOT NULL, "title" text NOT NULL, "problem" text NOT NULL,
  "expectedBenefit" text NOT NULL, "requestType" text NOT NULL, "discipline" text NOT NULL,
  "priority" text NOT NULL DEFAULT 'MEDIUM', "desiredDate" timestamp(3),
  "status" text NOT NULL DEFAULT 'DRAFT', "previousStatus" text,
  "version" integer NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "requestedByUserId" text NOT NULL REFERENCES "User"("id"),
  "responsibleUserId" text REFERENCES "User"("id"), "reviewerUserId" text REFERENCES "User"("id"),
  "validatorUserId" text REFERENCES "User"("id"),
  "originWorkOrderId" text REFERENCES "WorkOrder"("id") ON DELETE RESTRICT,
  "originNoticeId" text REFERENCES "Notice"("id") ON DELETE RESTRICT,
  "proposal" jsonb, "proposalAuthorId" text REFERENCES "User"("id"), "approvedRevision" integer,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" timestamp(3),
  CHECK ("status" IN ('DRAFT','SUBMITTED','NEEDS_INFO','STUDY','REVIEW','APPROVED','EXECUTION','VALIDATION','CLOSED','REJECTED','CANCELED','ON_HOLD')),
  CHECK ("requestType" IN ('REFORM','IMPROVEMENT','ADAPTATION','OBSOLESCENCE')),
  CHECK ("priority" IN ('LOW','MEDIUM','HIGH','URGENT'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "EngineeringRequest_tenantId_number_key" ON "EngineeringRequest" ("tenantId","number");
CREATE INDEX IF NOT EXISTS "EngineeringRequest_tenantId_assetId_createdAt_idx" ON "EngineeringRequest" ("tenantId","assetId","createdAt");
CREATE INDEX IF NOT EXISTS "EngineeringRequest_tenantId_status_updatedAt_idx" ON "EngineeringRequest" ("tenantId","status","updatedAt");
CREATE TABLE IF NOT EXISTS "EngineeringRequestRevision" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL REFERENCES "Tenant"("id"),
  "requestId" text NOT NULL REFERENCES "EngineeringRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "revision" integer NOT NULL CHECK ("revision" > 0), "snapshot" jsonb NOT NULL,
  "createdByUserId" text NOT NULL REFERENCES "User"("id"), "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "EngineeringRequestRevision_requestId_revision_key" ON "EngineeringRequestRevision" ("requestId","revision");
CREATE TABLE IF NOT EXISTS "EngineeringRequestEvent" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL REFERENCES "Tenant"("id"),
  "requestId" text NOT NULL REFERENCES "EngineeringRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "action" text NOT NULL, "fromStatus" text, "toStatus" text, "actorId" text NOT NULL REFERENCES "User"("id"),
  "actorName" text NOT NULL, "note" text, "details" jsonb, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EngineeringRequestEvent_tenantId_requestId_createdAt_idx" ON "EngineeringRequestEvent" ("tenantId","requestId","createdAt");
CREATE TABLE IF NOT EXISTS "EngineeringRequestOrder" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL REFERENCES "Tenant"("id"),
  "requestId" text NOT NULL REFERENCES "EngineeringRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "workOrderId" text NOT NULL REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "EngineeringRequestOrder_requestId_workOrderId_key" ON "EngineeringRequestOrder" ("requestId","workOrderId");
ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "engineeringRequestId" text REFERENCES "EngineeringRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
