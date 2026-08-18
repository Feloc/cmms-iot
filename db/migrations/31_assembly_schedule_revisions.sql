ALTER TABLE "AssemblyExecution"
  ADD COLUMN IF NOT EXISTS "scheduleVersion" integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "AssemblyScheduleRevision" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "executionId" text NOT NULL,
  "version" integer NOT NULL,
  "reason" text NOT NULL,
  "createdByUserId" text NOT NULL,
  "createdByName" text NOT NULL,
  "baselineStartAt" timestamp(3) NOT NULL,
  "baselineEndAt" timestamp(3) NOT NULL,
  "snapshot" jsonb NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssemblyScheduleRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssemblyScheduleRevision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssemblyScheduleRevision_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AssemblyExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AssemblyScheduleRevision_executionId_version_key"
  ON "AssemblyScheduleRevision"("executionId", "version");

CREATE INDEX IF NOT EXISTS "AssemblyScheduleRevision_tenantId_executionId_createdAt_idx"
  ON "AssemblyScheduleRevision"("tenantId", "executionId", "createdAt" DESC);
