import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { MeasurementPhase } from '@prisma/client';

export class CreateServiceOrderHourmeterReadingDto {
  @IsNumber()
  @Min(0)
  reading!: number;

  @IsOptional()
  @IsDateString()
  readingAt?: string;

  @IsOptional()
  @IsEnum(MeasurementPhase)
  phase?: MeasurementPhase;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  allowDecrease?: boolean;
}
