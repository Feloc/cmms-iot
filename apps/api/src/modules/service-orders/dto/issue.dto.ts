import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

const ServiceOrderIssueStatuses = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_PARTS: 'WAITING_PARTS',
  RESOLVED: 'RESOLVED',
  VERIFIED: 'VERIFIED',
  CANCELED: 'CANCELED',
} as const;

export class UpsertServiceOrderIssueDto {
  @IsOptional()
  @IsEnum(ServiceOrderIssueStatuses)
  status?: 'OPEN' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'RESOLVED' | 'VERIFIED' | 'CANCELED';

  @IsOptional()
  @IsString()
  ownerUserId?: string | null;

  @IsOptional()
  @IsDateString()
  targetResolutionAt?: string | null;

  @IsOptional()
  @IsString()
  followUpNote?: string | null;

  @IsOptional()
  @IsString()
  resolutionSummary?: string | null;

  @IsOptional()
  @IsString()
  resolutionWorkOrderId?: string | null;

  @IsOptional()
  @IsString()
  verificationNotes?: string | null;
}

export class CreateCorrectiveFromIssueDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  durationMin?: number;

  @IsOptional()
  @IsString()
  technicianId?: string;
}
