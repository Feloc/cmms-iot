ALTER TABLE IF EXISTS "public"."AssetMaintenancePlan"
  ADD COLUMN IF NOT EXISTS "planStartAt" timestamp(3) without time zone;
