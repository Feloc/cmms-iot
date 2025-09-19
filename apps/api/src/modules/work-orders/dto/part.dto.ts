import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePartDto {
  @IsOptional() @IsString() inventoryItemId?: string;
  @IsOptional() @IsString() freeText?: string;
  @IsNumber() qty!: number;
  @IsOptional() @IsNumber() unitCost?: number;
}

export class UpdatePartDto {
  @IsOptional() @IsString() inventoryItemId?: string;
  @IsOptional() @IsString() freeText?: string;
  @IsOptional() @IsNumber() qty?: number;
  @IsOptional() @IsNumber() unitCost?: number;
}
