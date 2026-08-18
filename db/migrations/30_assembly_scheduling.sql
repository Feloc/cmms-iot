ALTER TABLE "AssemblyTemplateStep"
  ADD COLUMN IF NOT EXISTS "dependsOnPositions" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "AssemblyActivity"
  ADD COLUMN IF NOT EXISTS "dependsOnPositions" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Los procedimientos anteriores eran secuenciales: conservamos ese comportamiento.
UPDATE "AssemblyTemplateStep"
SET "dependsOnPositions" = jsonb_build_array("position" - 1)
WHERE "position" > 1 AND "dependsOnPositions" = '[]'::jsonb;

UPDATE "AssemblyActivity"
SET "dependsOnPositions" = jsonb_build_array("position" - 1)
WHERE "position" > 1 AND "dependsOnPositions" = '[]'::jsonb;

ALTER TABLE "AssemblyExecution"
  ADD COLUMN IF NOT EXISTS "scheduledStartAt" timestamp(3),
  ADD COLUMN IF NOT EXISTS "scheduleTimezone" text NOT NULL DEFAULT 'America/Bogota',
  ADD COLUMN IF NOT EXISTS "workdayStartMinute" integer NOT NULL DEFAULT 480,
  ADD COLUMN IF NOT EXISTS "workdayEndMinute" integer NOT NULL DEFAULT 1020,
  ADD COLUMN IF NOT EXISTS "workingDays" jsonb NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  ADD COLUMN IF NOT EXISTS "excludedDates" jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE "AssemblyExecution" execution
SET "scheduledStartAt" = work_order."dueDate"
FROM "WorkOrder" work_order
WHERE execution."workOrderId" = work_order."id"
  AND execution."scheduledStartAt" IS NULL
  AND work_order."dueDate" IS NOT NULL;
