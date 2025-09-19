import { IsOptional, IsString } from 'class-validator';

export class UpsertResolutionDto {
  @IsOptional() @IsString() symptomCodeId?: string;
  @IsOptional() @IsString() symptomOther?: string;

  @IsOptional() @IsString() causeCodeId?: string;
  @IsOptional() @IsString() causeOther?: string;
  @IsOptional() @IsString() rootCauseText?: string;

  @IsOptional() @IsString() remedyCodeId?: string;
  @IsOptional() @IsString() remedyOther?: string;
  @IsOptional() @IsString() solutionSummary?: string;
  @IsOptional() @IsString() preventiveRecommendation?: string;
}
