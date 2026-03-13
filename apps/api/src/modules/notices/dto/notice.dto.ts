import { IsOptional, IsString, IsISO8601, IsArray, IsInt, Min, MaxLength, IsIn } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

const NOTICE_SOURCES = ['RULE', 'MANUAL', 'IMPORT'] as const;
const NOTICE_CATEGORIES = ['INCIDENT', 'MAINT_LOG', 'CONSUMABLE_CHANGE', 'INSPECTION', 'OTHER'] as const;
const NOTICE_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

type NoticeSourceValue = (typeof NOTICE_SOURCES)[number];
type NoticeCategoryValue = (typeof NOTICE_CATEGORIES)[number];
type NoticeStatusValue = (typeof NOTICE_STATUSES)[number];
type SeverityValue = (typeof SEVERITIES)[number];

export class CreateNoticeDto {

  @IsIn(NOTICE_SOURCES)
  source!: NoticeSourceValue;

  @IsOptional()
  @IsString()
  alertId?: string;

  @IsString()
  assetCode!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsIn(NOTICE_CATEGORIES)
  category!: NoticeCategoryValue;

  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: SeverityValue;

  @IsOptional()
  @IsIn(NOTICE_STATUSES)
  status?: NoticeStatusValue; // default OPEN

  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsISO8601()
  startedAt?: string;

  @IsOptional()
  @IsISO8601()
  resolvedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  downtimeMin?: number;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  attachments?: any;


  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

}

export class UpdateNoticeDto extends PartialType(CreateNoticeDto) {}
