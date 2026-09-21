import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ReceiveStockDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(Number.MIN_VALUE)
  qty!: number;

  @IsOptional() @IsString() @MaxLength(100)
  inventoryStockId?: string;

  @IsOptional() @IsString() @MaxLength(200)
  warehouse?: string;

  @IsOptional() @IsString() @MaxLength(200)
  binLocation?: string;

  @IsOptional() @IsString() @MaxLength(200)
  referenceLabel?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  note?: string;
}
