import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateServiceOrderQuoteDto {
  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  laborAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
