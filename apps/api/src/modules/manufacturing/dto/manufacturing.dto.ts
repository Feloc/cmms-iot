export type ManufacturingMemberInput = {
  userId: string;
  function: 'RESPONSIBLE' | 'ENGINEERING' | 'REVIEWER' | 'OBSERVER';
};

export class CreateManufacturingOrderDto {
  projectName!: string;
  productCode?: string | null;
  productName!: string;
  model?: string | null;
  quantity?: number;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | null;
  customerName?: string | null;
  customerReference?: string | null;
  commercialReference?: string | null;
  destination?: string | null;
  description?: string | null;
  requestedDeliveryAt?: string | Date | null;
  plannedStartAt?: string | Date | null;
  plannedEndAt?: string | Date | null;
  responsibleUserId!: string;
  members?: ManufacturingMemberInput[];
}

export class UpdateManufacturingOrderDto {
  version!: number;
  projectName?: string;
  productCode?: string | null;
  productName?: string;
  model?: string | null;
  quantity?: number;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | null;
  customerName?: string | null;
  customerReference?: string | null;
  commercialReference?: string | null;
  destination?: string | null;
  description?: string | null;
  requestedDeliveryAt?: string | Date | null;
  plannedStartAt?: string | Date | null;
  plannedEndAt?: string | Date | null;
  responsibleUserId?: string;
}

export class ManufacturingReasonDto {
  reason!: string;
}

export class ReplaceManufacturingMembersDto {
  members!: ManufacturingMemberInput[];
}

export class UpdateManufacturedUnitDto {
  serialNumber?: string | null;
  internalCode?: string | null;
  status?: 'PLANNED' | 'CANCELED';
}
