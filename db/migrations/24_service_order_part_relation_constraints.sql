UPDATE "public"."ServiceOrderPart" AS part
SET "sourceServiceOrderId" = NULL
WHERE part."sourceServiceOrderId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "public"."WorkOrder" AS work_order
    WHERE work_order."id" = part."sourceServiceOrderId"
  );

UPDATE "public"."ServiceOrderPart" AS part
SET "replacementServiceOrderId" = NULL
WHERE part."replacementServiceOrderId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "public"."WorkOrder" AS work_order
    WHERE work_order."id" = part."replacementServiceOrderId"
  );

UPDATE "public"."ServiceOrderPart" AS part
SET "sourceServiceOrderPartId" = NULL
WHERE part."sourceServiceOrderPartId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "public"."ServiceOrderPart" AS source_part
    WHERE source_part."id" = part."sourceServiceOrderPartId"
  );

UPDATE "public"."ServiceOrderPart" AS part
SET "replacementServiceOrderPartId" = NULL
WHERE part."replacementServiceOrderPartId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "public"."ServiceOrderPart" AS replacement_part
    WHERE replacement_part."id" = part."replacementServiceOrderPartId"
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceOrderPart_sourceServiceOrderId_fkey') THEN
    ALTER TABLE "public"."ServiceOrderPart"
      ADD CONSTRAINT "ServiceOrderPart_sourceServiceOrderId_fkey"
      FOREIGN KEY ("sourceServiceOrderId") REFERENCES "public"."WorkOrder"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceOrderPart_replacementServiceOrderId_fkey') THEN
    ALTER TABLE "public"."ServiceOrderPart"
      ADD CONSTRAINT "ServiceOrderPart_replacementServiceOrderId_fkey"
      FOREIGN KEY ("replacementServiceOrderId") REFERENCES "public"."WorkOrder"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceOrderPart_sourceServiceOrderPartId_fkey') THEN
    ALTER TABLE "public"."ServiceOrderPart"
      ADD CONSTRAINT "ServiceOrderPart_sourceServiceOrderPartId_fkey"
      FOREIGN KEY ("sourceServiceOrderPartId") REFERENCES "public"."ServiceOrderPart"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceOrderPart_replacementServiceOrderPartId_fkey') THEN
    ALTER TABLE "public"."ServiceOrderPart"
      ADD CONSTRAINT "ServiceOrderPart_replacementServiceOrderPartId_fkey"
      FOREIGN KEY ("replacementServiceOrderPartId") REFERENCES "public"."ServiceOrderPart"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "ServiceOrderPart_tenantId_sourceServiceOrderId_idx"
  ON "public"."ServiceOrderPart" ("tenantId", "sourceServiceOrderId");

CREATE INDEX IF NOT EXISTS "ServiceOrderPart_tenantId_replacementServiceOrderId_idx"
  ON "public"."ServiceOrderPart" ("tenantId", "replacementServiceOrderId");
