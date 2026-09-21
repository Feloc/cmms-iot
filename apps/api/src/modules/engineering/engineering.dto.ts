import { Type, Transform } from 'class-transformer';
import { IsString, IsOptional, IsIn, IsInt, Min, MaxLength, IsNotEmpty, IsDateString, IsNumber, ValidateNested, IsBoolean, IsDefined, Matches } from 'class-validator';
import { PickType } from '@nestjs/mapped-types';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class EngineeringListDto {
  @IsOptional() @IsString() @MaxLength(100) assetId?: string;
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsIn(['','DRAFT','SUBMITTED','NEEDS_INFO','STUDY','REVIEW','APPROVED','EXECUTION','VALIDATION','CLOSED','REJECTED','CANCELED','ON_HOLD']) status?: string;
  @IsOptional() @IsIn(['','LOW','MEDIUM','HIGH','URGENT']) priority?: string;
  @IsOptional() @IsString() @MaxLength(100) responsibleUserId?: string;
  @IsOptional() @IsString() @Matches(/^[1-9][0-9]{0,5}$/) page?: string;
}
export class CreateEngineeringRequestDto {
  @IsString() @IsNotEmpty() assetId!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(10000) problem!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(10000) expectedBenefit!: string;
  @IsIn(['REFORM','IMPROVEMENT','ADAPTATION','OBSOLESCENCE']) requestType!: string;
  @IsIn(['MECHANICAL','ELECTRICAL','PNEUMATIC','HYDRAULIC','AUTOMATION','SOFTWARE','QUALITY','GENERAL']) discipline!: string;
  @IsIn(['LOW','MEDIUM','HIGH','URGENT']) priority!: string;
  @IsOptional() @IsDateString() desiredDate?: string;
  @IsOptional() @IsString() originWorkOrderId?: string;
  @IsOptional() @IsString() originNoticeId?: string;
}
export class VersionDto {
  @IsInt() @Min(1) version!: number;
}
export class ProposalDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(10000) solution!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(10000) scope!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(10000) materials!: string;
  @IsNumber() @Min(0) estimatedCost!: number;
  @IsIn(['COP','USD','EUR']) currency!: string;
  @IsNumber() @Min(0) downtimeHours!: number;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(10000) acceptanceCriteria!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(10000) documentImpact!: string;
}
export class SaveProposalDto extends VersionDto {
  @IsDefined() @ValidateNested() @Type(() => ProposalDto) proposal!: ProposalDto;
}
export class UpdateEngineeringRequestDto extends PickType(CreateEngineeringRequestDto, ['title','problem','expectedBenefit','requestType','discipline','priority','desiredDate'] as const) {
  @IsInt() @Min(1) version!: number;
}
export class EngineeringActionDto extends VersionDto {
  @IsIn(['submit','authorize-study','request-info','submit-review','approve','revise','reject','start','validate','rework','close','hold','resume','cancel']) action!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(10000) note?: string;
  @IsOptional() @IsString() responsibleUserId?: string;
  @IsOptional() @IsString() reviewerUserId?: string;
  @IsOptional() @IsString() validatorUserId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(10000) validationResult?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(10000) documentUpdates?: string;
  @IsOptional() @IsBoolean() criteriaMet?: boolean;
}
export class LinkEngineeringOrderDto extends VersionDto {
  @IsString() @IsNotEmpty() workOrderId!: string;
}
export class EngineeringCommentDto extends VersionDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(10000) note!: string;
}
