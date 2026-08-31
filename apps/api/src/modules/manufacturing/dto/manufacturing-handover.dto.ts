export class CreateManufacturingHandoverDto {
  trainingRequired?: boolean;
  notes?: string | null;
}

export class ManufacturingHandoverVersionDto {
  lockVersion!: number;
}

export class UpdateManufacturingHandoverDocumentDto {
  status!: string;
  reference?: string | null;
  url?: string | null;
  revision?: string | null;
  notes?: string | null;
  waiverReason?: string | null;
  lockVersion!: number;
}

export class CreateManufacturingHandoverTrainingDto {
  topic!: string;
  deliveredAt!: string;
  durationHours!: number | string;
  instructorName!: string;
  clientContactName!: string;
  attendeeCount!: number | string;
  evidenceReference!: string;
  notes?: string | null;
}

export class CreateManufacturingHandoverSpareDto {
  itemCode?: string | null;
  description!: string;
  quantity!: number | string;
  unit!: string;
  recommendedStock?: number | string | null;
  notes?: string | null;
}

export class AcceptManufacturingHandoverDto {
  clientName!: string;
  clientRole!: string;
  clientCompany?: string | null;
  clientSignature!: string;
  comments?: string | null;
  lockVersion!: number;
}
