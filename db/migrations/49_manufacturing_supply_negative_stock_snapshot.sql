-- Inventory movements may intentionally leave stockOnHand below zero to
-- represent a shortage. Supply plans preserve that real balance as a snapshot,
-- while stockAvailableSnapshot remains clamped to zero by the application.
ALTER TABLE "ManufacturingSupplyRequirement"
  DROP CONSTRAINT IF EXISTS "ManufacturingSupplyRequirement_quantities_check";

ALTER TABLE "ManufacturingSupplyRequirement"
  ADD CONSTRAINT "ManufacturingSupplyRequirement_quantities_check" CHECK (
    "quantityPerUnitSnapshot" > 0 AND "orderQuantitySnapshot" > 0 AND "requiredQuantity" > 0 AND
    "stockReservedSnapshot" >= 0 AND "stockAvailableSnapshot" >= 0 AND
    "stockCoveredQuantity" >= 0 AND "plannedQuantity" >= 0 AND "fulfilledQuantity" >= 0
  );
