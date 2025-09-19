import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { MeasurementPhase } from '@prisma/client';

export class CreateMeasurementDto {
  @IsString() type!: string;
  @IsOptional() @IsNumber() valueNumeric?: number;
  @IsOptional() @IsString() valueText?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsEnum(MeasurementPhase) phase?: MeasurementPhase;
  @IsOptional() @IsDateString() takenAt?: string;
}

export class UpdateMeasurementDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsNumber() valueNumeric?: number;
  @IsOptional() @IsString() valueText?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsEnum(MeasurementPhase) phase?: MeasurementPhase;
  @IsOptional() @IsDateString() takenAt?: string;
}
