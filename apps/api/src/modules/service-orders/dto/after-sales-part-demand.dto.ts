export class CreateAfterSalesPartDemandDto {
  requestedQuantity?: number;
  replacementReason?: 'NORMAL_WEAR' | 'PREMATURE_FAILURE' | 'ACCIDENTAL_DAMAGE' | 'DESIGN_DEFECT' | 'TRANSPORT_DAMAGE' | 'MISUSE' | 'UNKNOWN';
  coverageStatus?: 'PENDING_REVIEW' | 'WARRANTY_APPROVED' | 'WARRANTY_REJECTED' | 'CUSTOMER_BILLABLE' | 'GOODWILL' | 'INTERNAL_COST';
  supplyRoute!: 'STOCK' | 'BUY' | 'MAKE' | 'SUBCONTRACT';
  requiredAt?: string | Date | null;
  notes?: string | null;
}

export class UpdateAfterSalesPartDemandDto {
  removedPartDisposition?: { disposition: string; notes: string };
  lockVersion!: number;
  status?: 'VALIDATED' | 'SOURCING' | 'IN_PRODUCTION' | 'QUALITY_PENDING' | 'READY' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'ON_HOLD' | 'CANCELED';
  replacementReason?: 'NORMAL_WEAR' | 'PREMATURE_FAILURE' | 'ACCIDENTAL_DAMAGE' | 'DESIGN_DEFECT' | 'TRANSPORT_DAMAGE' | 'MISUSE' | 'UNKNOWN';
  coverageStatus?: 'PENDING_REVIEW' | 'WARRANTY_APPROVED' | 'WARRANTY_REJECTED' | 'CUSTOMER_BILLABLE' | 'GOODWILL' | 'INTERNAL_COST';
  supplyRoute?: 'STOCK' | 'BUY' | 'MAKE' | 'SUBCONTRACT';
  fulfilledQuantity?: number;
  requiredAt?: string | Date | null;
  notes?: string | null;
  reason?: string | null;
}

export class CreateSparePartManufacturingOrderDto {
  executionMode?: 'STANDARD' | 'EXPEDITED';
  profileId?: string;
  materialWarehouse?: string;
  responsibleUserId?: string;
  plannedStartAt?: string | Date | null;
  plannedEndAt?: string | Date | null;
  requestedDeliveryAt?: string | Date | null;
  description?: string | null;
}
