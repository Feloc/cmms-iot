import { IsString, IsOptional, IsNumber, IsIn, IsDateString } from 'class-validator';

export class CreateAssetDto {
  @IsString() code!: string;
  @IsString() name!: string;

  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serialNumber?: string;

  @IsOptional() @IsNumber() nominalPower?: number;
  @IsOptional() @IsString() nominalPowerUnit?: string;

  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'DECOMMISSIONED']) status?: 'ACTIVE'|'INACTIVE'|'DECOMMISSIONED';
  @IsOptional() @IsIn(['LOW','MEDIUM','HIGH']) criticality?: 'LOW'|'MEDIUM'|'HIGH';

  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() parentAssetId?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() supplierId?: string;

  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsString() qrCodeData?: string;
  @IsOptional() @IsString() ingestKey?: string;
  @IsOptional() @IsString() assetTopicPrefix?: string;
  @IsOptional() @IsString() defaultRuleSetId?: string;

  @IsOptional() @IsDateString() acquiredOn?: string;
}