ALTER TYPE "public"."ServiceOrderCommercialStatus" ADD VALUE IF NOT EXISTS 'NO_MANAGEMENT';
ALTER TYPE "public"."ServiceOrderCommercialStatus" ADD VALUE IF NOT EXISTS 'NOT_APPROVED';
ALTER TYPE "public"."ServiceOrderCommercialStatus" ADD VALUE IF NOT EXISTS 'PROGRAMMED';
ALTER TYPE "public"."ServiceOrderCommercialStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
