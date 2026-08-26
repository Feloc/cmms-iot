#!/bin/sh
set -eu

echo "[api] Starting production entrypoint..."

APP_ROOT="/app"
PRISMA_SCHEMA_PATH="$APP_ROOT/apps/api/prisma/schema.prisma"
SQL_MIGRATIONS_DIR="$APP_ROOT/db/migrations"
SQL_HISTORY_TABLE='public."SqlMigrationHistory"'
PSQL_DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&/\1/g; s/[?&]schema=[^&]*$//g; s/\?&/\?/g; s/[?]$//g')"

bootstrap_sql_history_if_needed() {
  applied_count="$(psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT COUNT(*) FROM ${SQL_HISTORY_TABLE}")"
  if [ "${applied_count}" != "0" ]; then
    return 0
  fi

  work_order_exists="$(psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT CASE WHEN to_regclass('public.\"WorkOrder\"') IS NULL THEN 0 ELSE 1 END")"
  if [ "${work_order_exists}" != "1" ]; then
    return 0
  fi

  echo "[api] Bootstrapping SQL migration history for existing database"
  for name in \
    00_globals_roles.sql \
    01_extensions.sql \
    02_schemas.sql \
    10_schema_no_privs.sql \
    12_privs_rls.sql \
    13_hourmeter_history.sql \
    14_service_order_issue_tracking.sql \
    15_inventory_unit_price.sql \
    16_asset_maintenance_plan_plan_start_at.sql \
    17_service_order_commercial_status.sql
  do
    psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO ${SQL_HISTORY_TABLE} (name) VALUES ('${name}') ON CONFLICT (name) DO NOTHING" >/dev/null
  done
}

run_sql_migrations() {
  if [ ! -d "$SQL_MIGRATIONS_DIR" ]; then
    echo "[api] No SQL migrations directory found"
    return 0
  fi

  echo "[api] Ensuring SQL migration history table"
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS public."SqlMigrationHistory" (
  name text PRIMARY KEY,
  "appliedAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SQL

  bootstrap_sql_history_if_needed

  find "$SQL_MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort | while read -r file; do
    name="$(basename "$file")"
    already_applied="$(psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT 1 FROM ${SQL_HISTORY_TABLE} WHERE name = '${name}' LIMIT 1")"
    if [ "${already_applied}" = "1" ]; then
      echo "[api] SQL migration already applied: ${name}"
      continue
    fi

    echo "[api] Applying SQL migration: ${name}"
    psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
    psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO ${SQL_HISTORY_TABLE} (name) VALUES ('${name}')" >/dev/null
  done
}

prepare_service_order_part_links() {
  part_table_exists="$(psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT CASE WHEN to_regclass('public.\"ServiceOrderPart\"') IS NULL THEN 0 ELSE 1 END")"
  if [ "${part_table_exists}" != "1" ]; then
    return 0
  fi

  source_column_exists="$(psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ServiceOrderPart' AND column_name = 'sourceServiceOrderId') THEN 1 ELSE 0 END")"
  if [ "${source_column_exists}" != "1" ]; then
    return 0
  fi

  echo "[api] Cleaning orphaned service-order part links before Prisma schema sync"
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
UPDATE public."ServiceOrderPart" AS part
SET "sourceServiceOrderId" = NULL
WHERE part."sourceServiceOrderId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public."WorkOrder" AS work_order WHERE work_order."id" = part."sourceServiceOrderId");

UPDATE public."ServiceOrderPart" AS part
SET "replacementServiceOrderId" = NULL
WHERE part."replacementServiceOrderId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public."WorkOrder" AS work_order WHERE work_order."id" = part."replacementServiceOrderId");

UPDATE public."ServiceOrderPart" AS part
SET "sourceServiceOrderPartId" = NULL
WHERE part."sourceServiceOrderPartId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public."ServiceOrderPart" AS source_part WHERE source_part."id" = part."sourceServiceOrderPartId");

UPDATE public."ServiceOrderPart" AS part
SET "replacementServiceOrderPartId" = NULL
WHERE part."replacementServiceOrderPartId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public."ServiceOrderPart" AS replacement_part WHERE replacement_part."id" = part."replacementServiceOrderPartId");
SQL
}

normalize_prisma_schema_object_names() {
  echo "[api] Normalizing legacy manufacturing constraint and index names before Prisma schema sync"
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  item record;
  table_oid regclass;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('ManufacturingSupplyRequest', 'ManufacturingSupplyRequest_requirementId_fkey', 'ManufacturingSupplyRequest_supplyRequirementId_fkey'),
      ('ManufacturingSupplyDelivery', 'ManufacturingSupplyDelivery_requestId_fkey', 'ManufacturingSupplyDelivery_supplyRequestId_fkey'),
      ('ManufacturingInspectionDecision', 'ManufacturingInspectionDecision_deliveryId_fkey', 'ManufacturingInspectionDecision_supplyDeliveryId_fkey'),
      ('ManufacturingKit', 'ManufacturingKit_orderId_fkey', 'ManufacturingKit_manufacturingOrderId_fkey'),
      ('ManufacturingKit', 'ManufacturingKit_unitId_fkey', 'ManufacturingKit_manufacturedUnitId_fkey'),
      ('ManufacturingKitLine', 'ManufacturingKitLine_requirementId_fkey', 'ManufacturingKitLine_supplyRequirementId_fkey')
    ) AS aliases(table_name, legacy_name, canonical_name)
  LOOP
    table_oid := to_regclass(format('public.%I', item.table_name));
    IF table_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = table_oid AND conname = item.legacy_name
    ) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = table_oid AND conname = item.canonical_name
    ) THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', item.table_name, item.legacy_name);
    ELSE
      EXECUTE format(
        'ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',
        item.table_name,
        item.legacy_name,
        item.canonical_name
      );
    END IF;
  END LOOP;

  FOR item IN
    SELECT * FROM (VALUES
      ('ManufacturingSupplyRequest_requirement_sequence_key', 'ManufacturingSupplyRequest_supplyRequirementId_sequence_key'),
      ('ManufacturingSupplyRequest_tenant_code_key', 'ManufacturingSupplyRequest_tenantId_requestCode_key'),
      ('ManufacturingSupplyRequest_tenant_type_status_promised_idx', 'ManufacturingSupplyRequest_tenantId_requestType_status_promisedAt_idx'),
      ('ManufacturingSupplyRequest_tenant_requirement_status_idx', 'ManufacturingSupplyRequest_tenantId_supplyRequirementId_status_idx'),
      ('ManufacturingSupplyDelivery_tenant_request_delivered_idx', 'ManufacturingSupplyDelivery_tenantId_supplyRequestId_deliveredAt_idx'),
      ('ManufacturingInspectionDecision_tenant_delivery_inspected_idx', 'ManufacturingInspectionDecision_tenantId_supplyDeliveryId_inspectedAt_idx'),
      ('ManufacturingInspectionDecision_tenant_type_inspected_idx', 'ManufacturingInspectionDecision_tenantId_decisionType_inspectedAt_idx'),
      ('ManufacturingKit_plan_unit_key', 'ManufacturingKit_supplyPlanId_manufacturedUnitId_key'),
      ('ManufacturingKit_tenant_code_key', 'ManufacturingKit_tenantId_kitCode_key'),
      ('ManufacturingKit_tenant_order_status_idx', 'ManufacturingKit_tenantId_manufacturingOrderId_status_idx'),
      ('ManufacturingKit_tenant_plan_status_idx', 'ManufacturingKit_tenantId_supplyPlanId_status_idx'),
      ('ManufacturingKitLine_kit_requirement_key', 'ManufacturingKitLine_kitId_supplyRequirementId_key'),
      ('ManufacturingKitLine_tenant_kit_position_idx', 'ManufacturingKitLine_tenantId_kitId_positionSnapshot_idx'),
      ('ManufacturingKitLine_tenant_requirement_idx', 'ManufacturingKitLine_tenantId_supplyRequirementId_idx')
    ) AS aliases(legacy_name, canonical_name)
  LOOP
    IF to_regclass(format('public.%I', item.legacy_name)) IS NULL THEN
      CONTINUE;
    END IF;

    IF to_regclass(format('public.%I', item.canonical_name)) IS NOT NULL THEN
      EXECUTE format('DROP INDEX public.%I', item.legacy_name);
    ELSE
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', item.legacy_name, item.canonical_name);
    END IF;
  END LOOP;
END $$;
SQL
}

cd "$APP_ROOT"

prepare_service_order_part_links
normalize_prisma_schema_object_names

# Ensure Prisma client exists (should be generated during npm ci)
# Apply schema:
# - If migrations exist -> migrate deploy
# - Otherwise -> db push (useful for first internal pilot)
if [ -d "$APP_ROOT/apps/api/prisma/migrations" ] && [ "$(ls -A "$APP_ROOT/apps/api/prisma/migrations" 2>/dev/null)" ]; then
  echo "[api] prisma migrate deploy"
  npx prisma migrate deploy --schema "$PRISMA_SCHEMA_PATH"
else
  echo "[api] prisma db push (no migrations found)"
  npx prisma db push --accept-data-loss --schema "$PRISMA_SCHEMA_PATH"
fi

run_sql_migrations

echo "[api] Starting NestJS"
exec node "$APP_ROOT/apps/api/dist/main.js"
