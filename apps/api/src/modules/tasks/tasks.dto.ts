import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class ParticipantDto {
  @IsString() @IsNotEmpty() @MaxLength(100) userId!: string;
  @IsIn(['COLLABORATOR', 'OBSERVER']) role!: string;
}
export class TaskInputDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsString() @MaxLength(10000) description!: string;
  @IsString() @MaxLength(10000) expectedResult!: string;
  @IsIn(['PRIVATE', 'PUBLIC', 'SELECTIVE']) visibility!: string;
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority!: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) responsibleUserId?: string | null;
  @IsOptional() @IsDateString() plannedStart?: string | null;
  @IsOptional() @IsDateString() dueAt?: string | null;
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ParticipantDto) participants!: ParticipantDto[];
  @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsString({ each: true }) @MaxLength(50, { each: true }) tags!: string[];
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) assetId?: string | null;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) workOrderId?: string | null;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) manufacturingOrderId?: string | null;
}
export class EditTaskDto extends TaskInputDto { @IsInt() @Min(1) version!: number; }
export class VersionDto { @IsInt() @Min(1) version!: number; }
export class TaskActionDto extends VersionDto {
  @IsIn(['start', 'pause', 'complete', 'cancel', 'reopen', 'archive', 'restore']) action!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(10000) note?: string;
}
export class TaskUpdateDto extends VersionDto {
  @IsIn(['PROGRESS', 'COMMENT']) kind!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(10000) note!: string;
  @ValidateIf(o => o.kind === 'PROGRESS' || o.progressPercent !== undefined) @IsInt() @Min(0) @Max(99) progressPercent?: number;
  @ValidateIf(o => o.minutesSpent !== undefined) @IsInt() @Min(0) @Max(100000) minutesSpent?: number;
}
export class DependencyDto extends VersionDto { @IsString() @IsNotEmpty() @MaxLength(100) predecessorId!: string; }
export class TaskListDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsIn(['all', 'assigned', 'created', 'shared']) scope?: string;
  @IsOptional() @IsIn(['PENDING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELED']) status?: string;
  @IsOptional() @IsIn(['PRIVATE', 'PUBLIC', 'SELECTIVE']) visibility?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: string;
  @IsOptional() @IsString() @MaxLength(100) responsibleUserId?: string;
  @IsOptional() @IsIn(['true', 'false']) archived?: string;
  @IsOptional() @IsIn(['overdue', 'blocked', 'stale']) condition?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
}
export class TaskReferenceDto {
  @IsIn(['asset', 'workOrder', 'manufacturingOrder']) type!: string;
  @IsOptional() @IsString() @MaxLength(200) q?: string;
}
