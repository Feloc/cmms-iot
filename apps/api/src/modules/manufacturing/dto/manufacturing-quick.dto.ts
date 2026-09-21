export type QuickRecipeInput = {
  name: string; specification: string; drawingRevision: string;
  critical: boolean; stableDesign: boolean; requiresSerial: boolean;
  inspectionMode: 'LOT' | 'UNIT'; currency: string; hourlyRate: number;
  materials: Array<{ inventoryItemId: string; quantity: number; sku?: string; name?: string; uom?: string }>;
  operations: Array<{ name: string; instructions?: string; estimatedMinutes: number; evidenceRequired?: boolean }>;
  checks: Array<{ name: string; criteria: string; type: 'PASS_FAIL' | 'NUMERIC'; min?: number | null; max?: number | null; evidenceRequired?: boolean }>;
};
export class CreateManufacturingQuickProfileDto { recipe!: QuickRecipeInput; validUntil?: string | null; }
export class ManufacturingQuickProfileActionDto { approvalExceptionReason?: string; }
export class EnableManufacturingQuickDto { version!: number; profileId!: string; materialWarehouse?: string; }
export class ManufacturingQuickCommandDto {
  lockVersion!: number;
  operation?: number; inventoryItemId?: string; quantity?: number;
  reason?: string; evidence?: string; notes?: string; serial?: string;
  results?: Array<{ result: 'PASS' | 'FAIL'; value?: number | null; evidence?: string }>;
  destination?: 'STOCK' | 'DIRECT'; recipient?: string; warehouse?: string; binLocation?: string | null;
  approvalExceptionReason?: string;
}
