ALTER TABLE "public"."ServiceOrderPart"
  ADD COLUMN IF NOT EXISTS "sourceServiceOrderId" text,
  ADD COLUMN IF NOT EXISTS "sourceServiceOrderPartId" text,
  ADD COLUMN IF NOT EXISTS "replacementServiceOrderId" text,
  ADD COLUMN IF NOT EXISTS "replacementServiceOrderPartId" text;

CREATE INDEX IF NOT EXISTS "ServiceOrderPart_tenantId_sourceServiceOrderPartId_idx"
  ON "public"."ServiceOrderPart" USING "btree" ("tenantId", "sourceServiceOrderPartId");

CREATE INDEX IF NOT EXISTS "ServiceOrderPart_tenantId_replacementServiceOrderPartId_idx"
  ON "public"."ServiceOrderPart" USING "btree" ("tenantId", "replacementServiceOrderPartId");
