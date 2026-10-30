import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export const CAPABILITIES = ['READ', 'QUOTE', 'SOURCE', 'PURCHASE', 'RECEIVE', 'SERVICE', 'INVOICE', 'DISPATCH'] as const;
export const PURPOSES = ['REQUEST', 'SUPPLIER_QUOTE', 'CUSTOMER_QUOTE', 'CUSTOMER_PO', 'SUPPLIER_PO', 'RECEIPT', 'SERVICE', 'INVOICE', 'DELIVERY', 'OTHER'] as const;
export class VersionDto { @IsInt() @Min(1) version!: number; }
export class LineDto {
  @IsOptional() @IsString() @MaxLength(100) id?: string;
  @IsIn(['PART', 'SERVICE']) kind!: string;
  @IsIn(['BUY', 'MAKE', 'STOCK', 'SERVICE']) route!: string;
  @IsString() @MaxLength(1000) description!: string;
  @IsString() @MaxLength(20) uom!: string;
  @IsString() @Matches(/^\d{1,9}(\.\d{1,6})?$/) quantity!: string;
  @IsString() @Matches(/^\d{1,10}(\.\d{1,2})?$/) unitPrice!: string;
  @IsString() @Matches(/^\d{1,3}(\.\d{1,2})?$/) taxPct!: string;
  @IsOptional() @IsString() @MaxLength(100) inventoryItemId?: string;
}
export class CreateQuotationDto {
  @IsString() @MaxLength(200) title!: string;
  @IsString() @MaxLength(200) customerName!: string;
  @IsOptional() @IsString() @MaxLength(50) customerTaxId?: string;
  @IsString() @MaxLength(200) contactName!: string;
  @IsOptional() @IsEmail() @MaxLength(200) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(80) contactPhone?: string;
  @IsString() @MaxLength(10000) description!: string;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsString() @MaxLength(100) coordinatorId!: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() @MaxLength(100) assetId?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => LineDto) lines!: LineDto[];
}
export class EditLinesDto extends VersionDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => LineDto) lines!: LineDto[];
}
export class QuantityDto {
  @IsString() @MaxLength(100) lineId!: string;
  @IsString() @Matches(/^\d{1,9}(\.\d{1,6})?$/) quantity!: string;
}
export class ActionDto extends VersionDto {
  @IsIn(['SOURCE', 'PREPARE', 'SEND', 'REVISE', 'APPROVE', 'REJECT', 'HOLD', 'RESUME', 'CANCEL', 'CLOSE', 'HANDOFF', 'COMMENT']) action!: string;
  @IsOptional() @IsString() @MaxLength(4000) note?: string;
  @IsOptional() @IsString() @MaxLength(100) responsibleId?: string;
  @IsOptional() @IsIn(['TECHNICAL', 'PURCHASING', 'MANUFACTURING', 'WAREHOUSE', 'BILLING', 'LOGISTICS']) area?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() @MaxLength(100) evidenceId?: string;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() @MaxLength(5000) terms?: string;
  @IsOptional() @IsString() @MaxLength(200) sentTo?: string;
  @IsOptional() @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) amount?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => QuantityDto) items?: QuantityDto[];
}
export class OfferDto extends VersionDto {
  @IsString() @MaxLength(100) lineId!: string;
  @IsString() @MaxLength(200) supplier!: string;
  @IsString() @MaxLength(200) reference!: string;
  @IsString() @Matches(/^\d{1,10}(\.\d{1,2})?$/) unitCost!: string;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsInt() @Min(0) @Max(3650) leadDays!: number;
  @IsDateString() validUntil!: string;
  @IsString() @MaxLength(100) evidenceId!: string;
}
export class DocumentDto extends VersionDto {
  @IsOptional() @IsString() @MaxLength(100) responsibleId?: string;
  @IsOptional() @IsIn(['TECHNICAL', 'PURCHASING', 'MANUFACTURING', 'WAREHOUSE', 'BILLING', 'LOGISTICS']) area?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsIn(['PURCHASE', 'PRODUCTION', 'RECEIPT', 'SERVICE', 'INVOICE', 'DISPATCH', 'DELIVERY']) kind!: string;
  @IsString() @MaxLength(200) reference!: string;
  @IsString() @MaxLength(100) evidenceId!: string;
  @IsDateString() date!: string;
  @IsOptional() @IsString() @MaxLength(4000) note?: string;
  @IsOptional() @IsString() @MaxLength(100) sourceDocumentId?: string;
  @IsOptional() @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) amount?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => QuantityDto) items!: QuantityDto[];
}
export class LinkDto extends VersionDto {
  @IsString() @MaxLength(100) lineId!: string;
  @IsOptional() @IsString() @MaxLength(100) serviceOrderId?: string;
  @IsOptional() @IsString() @MaxLength(100) manufacturingOrderId?: string;
}
export class AccessDto {
  @IsString() @MaxLength(100) userId!: string;
  @IsArray() @ArrayMaxSize(8) @IsIn(CAPABILITIES, { each: true }) capabilities!: string[];
}
export class ListDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsIn(['REQUESTED', 'SOURCING', 'QUOTING', 'AWAITING_APPROVAL', 'FULFILLMENT', 'ON_HOLD', 'CLOSED', 'REJECTED', 'CANCELED']) status?: string;
  @IsOptional() @IsIn(['mine', 'customer', 'supplier', 'overdue']) view?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
}
export class UploadDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
  @IsIn(PURPOSES) purpose!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) revision?: number;
}
