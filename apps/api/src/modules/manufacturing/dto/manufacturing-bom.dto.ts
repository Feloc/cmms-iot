export class CreateManufacturingBomDto {
  code!: string;
  name!: string;
  description?: string | null;
  revisionCode?: string;
  changeSummary?: string;
}

export class CreateManufacturingBomRevisionDto {
  revisionCode!: string;
  changeSummary!: string;
  copyFromRevisionId?: string | null;
}

export type ManufacturingBomLineInput = {
  position: number;
  parentPosition?: number | null;
  inventoryItemId?: string | null;
  itemCode?: string;
  description?: string;
  quantityPerUnit: number | string;
  uom?: string;
  supplyType: 'STOCK' | 'BUY' | 'MAKE' | 'SUBCONTRACT';
  isOptional?: boolean;
  criticality?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  drawingDocumentId?: string | null;
  drawingRevisionId?: string | null;
  materialSpecification?: string | null;
  manufacturer?: string | null;
  manufacturerPartNo?: string | null;
  preferredSupplier?: string | null;
  leadTimeDays?: number | string | null;
  notes?: string | null;
};

export class ReplaceManufacturingBomLinesDto {
  lines!: ManufacturingBomLineInput[];
}

export class ReviewManufacturingBomRevisionDto {
  comment?: string | null;
}

export class CommitManufacturingBomImportDto {
  uploadToken!: string;
}
