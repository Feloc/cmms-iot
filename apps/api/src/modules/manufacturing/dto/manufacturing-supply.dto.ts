export class GenerateManufacturingSupplyPlanDto {
  engineeringReleaseId?: string;
}

export class UpdateManufacturingSupplyRequirementDto {
  lockVersion!: number;
  included?: boolean;
  plannedSupplyType?: 'STOCK' | 'BUY' | 'MAKE' | 'SUBCONTRACT';
  status?: 'OPEN' | 'IN_PROGRESS' | 'PARTIAL' | 'FULFILLED' | 'CANCELED';
  fulfilledQuantity?: number | string;
  supplier?: string | null;
  externalReference?: string | null;
  expectedAt?: string | Date | null;
  notes?: string | null;
}
