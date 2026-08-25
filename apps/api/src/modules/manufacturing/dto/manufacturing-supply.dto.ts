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

export class CreateManufacturingStockReservationDto {
  inventoryStockId!: string;
  quantity!: number | string;
  notes?: string | null;
}

export class ActOnManufacturingStockReservationDto {
  lockVersion!: number;
  quantity!: number | string;
  notes?: string | null;
}

export class CreateManufacturingSupplyRequestDto {
  quantity!: number | string;
  supplierOrResponsible?: string | null;
  externalReference?: string | null;
  promisedAt?: string | Date | null;
  notes?: string | null;
}

export class UpdateManufacturingSupplyRequestDto {
  lockVersion!: number;
  status?: 'REQUESTED' | 'IN_PROGRESS';
  supplierOrResponsible?: string | null;
  externalReference?: string | null;
  promisedAt?: string | Date | null;
  notes?: string | null;
}

export class DeliverManufacturingSupplyRequestDto {
  lockVersion!: number;
  quantity!: number | string;
  deliveredAt?: string | Date;
  reference?: string | null;
  notes?: string | null;
}

export class CancelManufacturingSupplyRequestDto {
  lockVersion!: number;
  reason!: string;
}

export class InspectManufacturingSupplyDeliveryDto {
  lockVersion!: number;
  acceptedQuantity?: number | string;
  rejectedQuantity?: number | string;
  quarantinedQuantity?: number | string;
  inspectedAt?: string | Date;
  reference?: string | null;
  notes?: string | null;
}

export class ResolveManufacturingQuarantineDto {
  lockVersion!: number;
  acceptedQuantity?: number | string;
  rejectedQuantity?: number | string;
  inspectedAt?: string | Date;
  reference?: string | null;
  notes?: string | null;
}

export class AdjustManufacturingKitLineDto {
  lockVersion!: number;
  quantity!: number | string;
}

export class WaiveManufacturingKitLineDto {
  lockVersion!: number;
  waivedQuantity!: number | string;
  reason?: string | null;
}

export class ReleaseManufacturingKitDto {
  lockVersion!: number;
  notes?: string | null;
}

export class CancelManufacturingKitDto {
  lockVersion!: number;
  reason!: string;
}
