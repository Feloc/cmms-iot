CREATE TABLE IF NOT EXISTS "public"."Goal" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "metric" text NOT NULL,
  "period" text NOT NULL,
  "target" integer NOT NULL,
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Goal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Goal_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Goal_tenantId_metric_period_key"
  ON "public"."Goal" ("tenantId", "metric", "period");

CREATE INDEX IF NOT EXISTS "Goal_tenantId_metric_period_idx"
  ON "public"."Goal" ("tenantId", "metric", "period");
