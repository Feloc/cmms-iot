import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export const conditions = ['GOOD', 'MAINTENANCE', 'DAMAGED', 'RETIRED'] as const;

export class ToolFieldsDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80) code!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) category?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) brand?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) model?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) serialNumber?: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) location!: string;
  @IsOptional() @IsString() @MaxLength(100) responsibleUserId?: string;
  @IsOptional() @IsDateString({ strict: true }) acquiredOn?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(5000) notes?: string;
}
export class CreateToolDto extends ToolFieldsDto {
  @IsIn(['UNIT', 'QUANTITY']) tracking!: string;
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @ValidateIf((_o, value) => value !== undefined) @IsIn(conditions) initialCondition?: string;
}
export class ToolVersionDto {
  @IsInt() @Min(1) version!: number;
}
export class EditToolDto extends ToolFieldsDto {
  @IsInt() @Min(1) version!: number;
}
export class LendToolDto extends ToolVersionDto {
  @IsString() @IsNotEmpty() @MaxLength(100) recipientUserId!: string;
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) destination!: string;
  @IsOptional() @IsDateString({ strict: true }) expectedReturnOn?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) note?: string;
}
export class ReturnToolDto extends ToolVersionDto {
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @IsIn(['GOOD', 'MAINTENANCE', 'DAMAGED']) condition!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) note?: string;
}
export class ToolConditionDto extends ToolVersionDto {
  @IsIn(['GOOD', 'MAINTENANCE', 'DAMAGED']) from!: string;
  @IsIn(conditions) to!: string;
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) note!: string;
}
export class ReceiveToolsDto extends ToolVersionDto {
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) note!: string;
}
export class ToolListDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(100) responsibleUserId?: string;
  @IsOptional() @IsIn(['UNIT', 'QUANTITY']) tracking?: string;
  @IsOptional() @IsIn(['AVAILABLE', 'LOANED', 'MAINTENANCE', 'DAMAGED', 'RETIRED']) status?: 'AVAILABLE' | 'LOANED' | 'MAINTENANCE' | 'DAMAGED' | 'RETIRED';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
}
export class ImportToolsDto {
  @IsString() @IsNotEmpty() @MaxLength(1000000) csv!: string;
}
export class ToolEventsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
}
