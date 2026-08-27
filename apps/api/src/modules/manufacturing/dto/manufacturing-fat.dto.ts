export class CreateManufacturingFatTemplateDto {
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

export class CreateManufacturingFatExecutionDto { templateId!: string; }
export class ManufacturingFatVersionDto { lockVersion!: number; }
export class RecordManufacturingFatCaseDto {
  lockVersion!: number;
  result?: 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
  measuredValue?: number | string | null;
  observedValue?: string | null;
  notes?: string | null;
}
export class CreateManufacturingFatEvidenceDto { title!: string; reference?: string | null; url?: string | null; notes?: string | null; }
export class UpdateManufacturingFatDeviationDto {
  lockVersion!: number;
  status!: 'OPEN' | 'IN_REWORK' | 'RESOLVED' | 'ACCEPTED_AS_IS';
  correctiveAction?: string | null;
  resolutionNotes?: string | null;
}
export class DecideManufacturingFatDto { lockVersion!: number; decision!: 'APPROVED' | 'REJECTED'; comments?: string | null; }
