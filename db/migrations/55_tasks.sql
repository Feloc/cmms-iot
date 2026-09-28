BEGIN;
-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."Task" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "expectedResult" TEXT NOT NULL DEFAULT '',
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "responsibleUserId" TEXT,
    "plannedStart" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "lastProgressAt" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assetId" TEXT,
    "workOrderId" TEXT,
    "manufacturingOrderId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."TaskParticipant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "TaskParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."TaskDependency" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."TaskUpdate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "progressPercent" INTEGER,
    "minutesSpent" INTEGER NOT NULL DEFAULT 0,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."TaskEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "note" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."TaskAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "updateId" TEXT,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_tenantId_archivedAt_status_dueAt_idx" ON "public"."Task"("tenantId", "archivedAt", "status", "dueAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_tenantId_createdByUserId_idx" ON "public"."Task"("tenantId", "createdByUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_tenantId_responsibleUserId_idx" ON "public"."Task"("tenantId", "responsibleUserId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Task_tenantId_id_key" ON "public"."Task"("tenantId", "id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskParticipant_tenantId_userId_idx" ON "public"."TaskParticipant"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TaskParticipant_taskId_userId_key" ON "public"."TaskParticipant"("taskId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskDependency_tenantId_predecessorId_idx" ON "public"."TaskDependency"("tenantId", "predecessorId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TaskDependency_taskId_predecessorId_key" ON "public"."TaskDependency"("taskId", "predecessorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskUpdate_tenantId_taskId_createdAt_idx" ON "public"."TaskUpdate"("tenantId", "taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TaskUpdate_tenantId_taskId_id_key" ON "public"."TaskUpdate"("tenantId", "taskId", "id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskEvent_tenantId_taskId_createdAt_idx" ON "public"."TaskEvent"("tenantId", "taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TaskAttachment_storageKey_key" ON "public"."TaskAttachment"("storageKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskAttachment_tenantId_taskId_createdAt_idx" ON "public"."TaskAttachment"("tenantId", "taskId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskParticipant_tenantId_taskId_fkey' AND conrelid = '"public"."TaskParticipant"'::regclass) THEN
    ALTER TABLE "public"."TaskParticipant" ADD CONSTRAINT "TaskParticipant_tenantId_taskId_fkey" FOREIGN KEY ("tenantId", "taskId") REFERENCES "public"."Task"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskDependency_tenantId_taskId_fkey' AND conrelid = '"public"."TaskDependency"'::regclass) THEN
    ALTER TABLE "public"."TaskDependency" ADD CONSTRAINT "TaskDependency_tenantId_taskId_fkey" FOREIGN KEY ("tenantId", "taskId") REFERENCES "public"."Task"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskDependency_tenantId_predecessorId_fkey' AND conrelid = '"public"."TaskDependency"'::regclass) THEN
    ALTER TABLE "public"."TaskDependency" ADD CONSTRAINT "TaskDependency_tenantId_predecessorId_fkey" FOREIGN KEY ("tenantId", "predecessorId") REFERENCES "public"."Task"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskUpdate_tenantId_taskId_fkey' AND conrelid = '"public"."TaskUpdate"'::regclass) THEN
    ALTER TABLE "public"."TaskUpdate" ADD CONSTRAINT "TaskUpdate_tenantId_taskId_fkey" FOREIGN KEY ("tenantId", "taskId") REFERENCES "public"."Task"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskEvent_tenantId_taskId_fkey' AND conrelid = '"public"."TaskEvent"'::regclass) THEN
    ALTER TABLE "public"."TaskEvent" ADD CONSTRAINT "TaskEvent_tenantId_taskId_fkey" FOREIGN KEY ("tenantId", "taskId") REFERENCES "public"."Task"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAttachment_tenantId_taskId_fkey' AND conrelid = '"public"."TaskAttachment"'::regclass) THEN
    ALTER TABLE "public"."TaskAttachment" ADD CONSTRAINT "TaskAttachment_tenantId_taskId_fkey" FOREIGN KEY ("tenantId", "taskId") REFERENCES "public"."Task"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAttachment_tenantId_taskId_updateId_fkey' AND conrelid = '"public"."TaskAttachment"'::regclass) THEN
    ALTER TABLE "public"."TaskAttachment" ADD CONSTRAINT "TaskAttachment_tenantId_taskId_updateId_fkey" FOREIGN KEY ("tenantId", "taskId", "updateId") REFERENCES "public"."TaskUpdate"("tenantId", "taskId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;


-- Domain invariants, including foreign keys for scalar references.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_tenantId_fkey' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_creator_fkey' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_responsible_fkey' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_responsible_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_asset_fkey' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_asset_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_workOrder_fkey' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_workOrder_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_manufacturingOrder_fkey' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_manufacturingOrder_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_visibility_check' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_visibility_check" CHECK ("visibility" IN ('PRIVATE','PUBLIC','SELECTIVE'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_priority_check' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_priority_check" CHECK ("priority" IN ('LOW','NORMAL','HIGH','URGENT'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_status_check' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_status_check" CHECK ("status" IN ('PENDING','IN_PROGRESS','PAUSED','COMPLETED','CANCELED'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_progress_check' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_progress_check" CHECK ("progressPercent" BETWEEN 0 AND 100 AND ("status" = 'COMPLETED') = ("progressPercent" = 100));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_version_check' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_version_check" CHECK ("version" > 0);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_dates_check' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_dates_check" CHECK ("plannedStart" IS NULL OR "dueAt" IS NULL OR "plannedStart" <= "dueAt");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_private_responsible_check' AND conrelid = '"Task"'::regclass) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_private_responsible_check" CHECK ("visibility" <> 'PRIVATE' OR "responsibleUserId" IS NULL OR "responsibleUserId" = "createdByUserId");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskParticipant_user_fkey' AND conrelid = '"TaskParticipant"'::regclass) THEN
    ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskParticipant_role_check' AND conrelid = '"TaskParticipant"'::regclass) THEN
    ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_role_check" CHECK ("role" IN ('COLLABORATOR','OBSERVER'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskDependency_self_check' AND conrelid = '"TaskDependency"'::regclass) THEN
    ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_self_check" CHECK ("taskId" <> "predecessorId");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskUpdate_actor_fkey' AND conrelid = '"TaskUpdate"'::regclass) THEN
    ALTER TABLE "TaskUpdate" ADD CONSTRAINT "TaskUpdate_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskUpdate_kind_check' AND conrelid = '"TaskUpdate"'::regclass) THEN
    ALTER TABLE "TaskUpdate" ADD CONSTRAINT "TaskUpdate_kind_check" CHECK (("kind" = 'COMMENT' AND "progressPercent" IS NULL AND "minutesSpent" = 0) OR ("kind" = 'PROGRESS' AND "progressPercent" BETWEEN 0 AND 99 AND "progressPercent" IS NOT NULL));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskUpdate_minutes_check' AND conrelid = '"TaskUpdate"'::regclass) THEN
    ALTER TABLE "TaskUpdate" ADD CONSTRAINT "TaskUpdate_minutes_check" CHECK ("minutesSpent" >= 0);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskEvent_actor_fkey' AND conrelid = '"TaskEvent"'::regclass) THEN
    ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAttachment_creator_fkey' AND conrelid = '"TaskAttachment"'::regclass) THEN
    ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAttachment_size_check' AND conrelid = '"TaskAttachment"'::regclass) THEN
    ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_size_check" CHECK ("size" >= 0 AND "size" <= 31457280);
  END IF;
END $$;
COMMIT;
