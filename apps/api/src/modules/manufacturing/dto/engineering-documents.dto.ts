export class CreateEngineeringDocumentDto {
  code!: string;
  name!: string;
  discipline!: 'MECHANICAL' | 'ELECTRICAL' | 'PNEUMATIC' | 'HYDRAULIC' | 'AUTOMATION' | 'SOFTWARE' | 'QUALITY' | 'GENERAL';
  documentType!: 'DRAWING' | 'SCHEMATIC' | 'SPECIFICATION' | 'DATASHEET' | 'PROGRAM' | 'MANUAL' | 'CALCULATION' | 'PROCEDURE' | 'OTHER';
  systemName?: string | null;
  description?: string | null;
}

export class UpdateEngineeringDocumentDto {
  name?: string;
  discipline?: CreateEngineeringDocumentDto['discipline'];
  documentType?: CreateEngineeringDocumentDto['documentType'];
  systemName?: string | null;
  description?: string | null;
  active?: boolean;
}

export class CreateEngineeringRevisionDto {
  revisionCode!: string;
  changeSummary!: string;
}

export class ReviewEngineeringRevisionDto {
  comment?: string | null;
}
