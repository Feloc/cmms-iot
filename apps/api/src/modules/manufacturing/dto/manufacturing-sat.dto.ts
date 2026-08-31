export class CreateManufacturingSatTemplateDto {
  code!: string;
  name!: string;
  description?: string | null;
  cases!: Array<{
    position: number;
    section?: string | null;
    name: string;
    instructions?: string | null;
    acceptanceCriteria: string;
    resultType?: 'BOOLEAN' | 'NUMERIC' | 'TEXT';
    minimumValue?: number | string | null;
    maximumValue?: number | string | null;
    unit?: string | null;
    required?: boolean;
    evidenceRequired?: boolean;
  }>;
}

export class CreateManufacturingSatExecutionDto { templateId!: string; }
export class ManufacturingSatVersionDto { lockVersion!: number; }
export class RecordManufacturingSatCaseDto {
  lockVersion!: number;
  result?: 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
  measuredValue?: number | string | null;
  observedValue?: string | null;
  notes?: string | null;
  deviationSeverity?: 'MINOR' | 'MAJOR' | 'CRITICAL';
}
export class CreateManufacturingSatEvidenceDto { title!: string; reference?: string | null; url?: string | null; notes?: string | null; }
export class UpdateManufacturingSatDeviationDto {
  lockVersion!: number;
  status!: 'OPEN' | 'IN_REWORK' | 'RESOLVED' | 'ACCEPTED_AS_IS';
  severity?: 'MINOR' | 'MAJOR' | 'CRITICAL';
  correctiveAction?: string | null;
  resolutionNotes?: string | null;
  responsibleUserId?: string | null;
  dueAt?: string | Date | null;
}
export class DecideManufacturingSatDto {
  lockVersion!: number;
  decision!: 'ACCEPTED' | 'ACCEPTED_WITH_PENDING_ITEMS' | 'REJECTED';
  comments?: string | null;
  clientName!: string;
  clientRole!: string;
  clientCompany?: string | null;
  clientSignature!: string;
  warrantyMonths?: number | string | null;
}
