import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateInventoryItemDto {
  @IsString()
  sku!: string;

  @IsOptional()
  @IsString()
  oemPartNo?: string | null;

  @IsOptional()
  @IsString()
  supplierPartNo?: string | null;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  partType?: string;

  @IsOptional()
  @IsString()
  uom?: string | null;

  @IsOptional()
  @IsString()
  systemGroup?: string | null;

  @IsOptional()
  @IsString()
  sectionCode?: string | null;

  @IsOptional()
  @IsString()
  sectionName?: string | null;

  @IsOptional()
  @IsString()
  itemNo?: string | null;

  @IsOptional()
  @IsString()
  parentOemPartNo?: string | null;

  @IsOptional()
  @IsString()
  preferredSupplier?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leadTimeDays?: number | null;

  @IsOptional()
  @IsString()
  criticality?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  interchangeableWith?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  qty?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lastCost?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  avgCost?: number | null;

  @IsOptional()
  @IsString()
  currency?: string | null;

  @IsOptional()
  applicability?: unknown[];

  @IsOptional()
  stocks?: unknown[];
}
