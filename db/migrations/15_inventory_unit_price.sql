ALTER TABLE "public"."InventoryItem"
  ADD COLUMN IF NOT EXISTS "unitPrice" double precision;
