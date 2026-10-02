-- Keep historical deviations as nonconformities; preserve all existing records.
ALTER TYPE "ManufacturingFatDeviationStatus" ADD VALUE IF NOT EXISTS 'PENDING_VERIFICATION';
BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE "ManufacturingFatDeviation"
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'NON_CONFORMITY',
  ADD COLUMN IF NOT EXISTS "severity" text NOT NULL DEFAULT 'MAJOR',
  ADD COLUMN IF NOT EXISTS "location" text,
  ADD COLUMN IF NOT EXISTS "responsibleUserId" text,
  ADD COLUMN IF NOT EXISTS "responsibleName" text,
  ADD COLUMN IF NOT EXISTS "dueAt" timestamp(3),
  ADD COLUMN IF NOT EXISTS "correctedByUserId" text,
  ADD COLUMN IF NOT EXISTS "correctedByName" text,
  ADD COLUMN IF NOT EXISTS "correctedAt" timestamp(3),
  ADD COLUMN IF NOT EXISTS "verificationNotes" text;
DO $$ BEGIN
  ALTER TABLE "ManufacturingFatDeviation" ADD CONSTRAINT "ManufacturingFatDeviation_classification_check"
    CHECK ("kind" IN ('NON_CONFORMITY', 'OBSERVATION') AND "severity" IN ('MINOR', 'MAJOR', 'CRITICAL') AND ("kind" <> 'OBSERVATION' OR "severity" = 'MINOR'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "ManufacturingFatEvidence" ADD COLUMN IF NOT EXISTS "deviationId" text;
DO $$ BEGIN
  ALTER TABLE "ManufacturingFatEvidence" ADD CONSTRAINT "ManufacturingFatEvidence_deviationId_fkey"
    FOREIGN KEY ("deviationId") REFERENCES "ManufacturingFatDeviation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingFatDeviation_tenant_case_id_key" ON "ManufacturingFatDeviation" ("tenantId", "fatCaseId", "id");
DO $$ BEGIN
  ALTER TABLE "ManufacturingFatEvidence" ADD CONSTRAINT "ManufacturingFatEvidence_deviation_case_fkey"
    FOREIGN KEY ("tenantId", "fatCaseId", "deviationId") REFERENCES "ManufacturingFatDeviation" ("tenantId", "fatCaseId", "id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "ManufacturingFatEvidence_tenantId_deviationId_createdAt_idx" ON "ManufacturingFatEvidence" ("tenantId", "deviationId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ManufacturingFatDeviation_assignee_due_idx" ON "ManufacturingFatDeviation" ("tenantId", "responsibleUserId", "status", "dueAt");
COMMIT;
