BEGIN;
CREATE TABLE IF NOT EXISTS "TelegramConnection" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL REFERENCES "Tenant"("id"),
  "userId" text NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "chatId" text, "telegramUserId" text, "username" text,
  "enabled" boolean NOT NULL DEFAULT false, "automatic" boolean NOT NULL DEFAULT true,
  "linkTokenHash" text UNIQUE, "linkExpiresAt" timestamp(3), "linkedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramConnection_tenantId_telegramUserId_key" ON "TelegramConnection" ("tenantId", "telegramUserId");
CREATE INDEX IF NOT EXISTS "TelegramConnection_chatId_idx" ON "TelegramConnection" ("chatId");
CREATE TABLE IF NOT EXISTS "TelegramDelivery" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL REFERENCES "Tenant"("id"),
  "userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "chatId" text NOT NULL, "linkedAt" timestamp(3) NOT NULL,
  "eventKey" text NOT NULL, "kind" text NOT NULL, "workOrderId" text, "actorUserId" text,
  "text" text NOT NULL, "status" text NOT NULL DEFAULT 'PENDING', "attempts" integer NOT NULL DEFAULT 0,
  "availableAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseId" text, "leaseUntil" timestamp(3), "error" text, "messageId" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sentAt" timestamp(3),
  CHECK ("status" IN ('PENDING','SENDING','SENT','FAILED','CANCELED')),
  CHECK ("kind" IN ('MANUAL','SCHEDULE','WELCOME'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramDelivery_tenantId_eventKey_userId_key" ON "TelegramDelivery" ("tenantId", "eventKey", "userId");
CREATE INDEX IF NOT EXISTS "TelegramDelivery_status_availableAt_idx" ON "TelegramDelivery" ("status", "availableAt");
CREATE INDEX IF NOT EXISTS "TelegramDelivery_tenantId_createdAt_idx" ON "TelegramDelivery" ("tenantId", "createdAt");
COMMIT;
