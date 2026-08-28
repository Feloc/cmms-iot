export class CreateManufacturingDispatchDto {
  destination?: string | null;
  deliveryAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  responsibleUserId?: string | null;
  plannedDispatchAt?: string | null;
  notes?: string | null;
}
export class UpdateManufacturingDispatchDto extends CreateManufacturingDispatchDto {
  lockVersion!: number;
  carrierName?: string | null;
  carrierReference?: string | null;
  driverName?: string | null;
  vehiclePlate?: string | null;
  trackingNumber?: string | null;
}
export class ManufacturingDispatchVersionDto { lockVersion!: number; }
export class UpdateManufacturingDispatchChecklistDto {
  lockVersion!: number;
  status!: 'PENDING' | 'COMPLETED' | 'NOT_APPLICABLE';
  evidenceReference?: string | null;
  notes?: string | null;
}
export class CreateManufacturingDispatchPackageDto {
  packageType!: 'CRATE' | 'PALLET' | 'BOX' | 'LOOSE' | 'OTHER';
  description!: string;
  lengthCm?: number | string | null;
  widthCm?: number | string | null;
  heightCm?: number | string | null;
  netWeightKg?: number | string | null;
  grossWeightKg!: number | string;
  serialNumber?: string | null;
  sealNumber?: string | null;
  notes?: string | null;
}
export class CreateManufacturingDispatchDocumentDto {
  documentType!: 'PACKING_LIST' | 'TRANSPORT_DOCUMENT' | 'COMMERCIAL_INVOICE' | 'INSURANCE' | 'CERTIFICATE' | 'MANUAL' | 'FAT_REPORT' | 'OTHER';
  title!: string;
  reference?: string | null;
  url?: string | null;
  notes?: string | null;
}
export class ExecuteManufacturingDispatchDto {
  lockVersion!: number;
  trackingNumber!: string;
  driverName?: string | null;
  vehiclePlate?: string | null;
  carrierReference?: string | null;
  notes?: string | null;
}
export class DeliverManufacturingDispatchDto { lockVersion!: number; receivedByName!: string; proofReference!: string; notes?: string | null; }
export class CancelManufacturingDispatchDto { lockVersion!: number; reason!: string; }
