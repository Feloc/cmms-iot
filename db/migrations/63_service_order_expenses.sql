BEGIN;

DO $$ BEGIN
  CREATE TYPE "ServiceExpenseCategory" AS ENUM ('TRANSPORT', 'MEALS', 'LODGING', 'TOLLS', 'PARKING', 'MATERIALS', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "ServiceExpensePaidBy" AS ENUM ('EMPLOYEE', 'COMPANY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "WorkOrder_tenantId_id_key" ON "WorkOrder" ("tenantId", "id");

CREATE TABLE IF NOT EXISTS "ServiceOrderExpense" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "workOrderId" TEXT NOT NULL,
  "expenseDate" DATE NOT NULL,
  "category" "ServiceExpenseCategory" NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL CHECK ("amount" > 0),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'COP' CHECK ("currency" = 'COP'),
  "paidBy" "ServiceExpensePaidBy" NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "voidedAt" TIMESTAMP(3),
  CONSTRAINT "ServiceOrderExpense_tenantId_workOrderId_fkey" FOREIGN KEY ("tenantId", "workOrderId")
    REFERENCES "WorkOrder" ("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceOrderExpense_tenantId_id_key" ON "ServiceOrderExpense" ("tenantId", "id");
CREATE INDEX IF NOT EXISTS "ServiceOrderExpense_tenantId_workOrderId_expenseDate_idx"
  ON "ServiceOrderExpense" ("tenantId", "workOrderId", "expenseDate" DESC);

ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "expenseId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_tenantId_expenseId_fkey"
    FOREIGN KEY ("tenantId", "expenseId") REFERENCES "ServiceOrderExpense" ("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Attachment_tenantId_expenseId_createdAt_idx"
  ON "Attachment" ("tenantId", "expenseId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ServiceOrderExpenseEvent" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceOrderExpenseEvent_tenantId_expenseId_fkey" FOREIGN KEY ("tenantId", "expenseId")
    REFERENCES "ServiceOrderExpense" ("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ServiceOrderExpenseEvent_tenantId_expenseId_createdAt_idx"
  ON "ServiceOrderExpenseEvent" ("tenantId", "expenseId", "createdAt");

COMMIT;
