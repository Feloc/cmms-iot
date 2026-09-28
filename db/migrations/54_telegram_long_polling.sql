BEGIN;
CREATE TABLE IF NOT EXISTS "TelegramPollingState" (
  "botId" text PRIMARY KEY,
  "nextOffset" bigint NOT NULL DEFAULT 0 CHECK ("nextOffset" >= 0),
  "leaseOwner" text,
  "leaseUntil" timestamp(3),
  "lastPollAt" timestamp(3),
  "lastError" text
);
COMMIT;
