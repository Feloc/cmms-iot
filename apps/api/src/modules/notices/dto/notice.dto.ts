import { IsEnum, IsOptional, IsString, IsISO8601, IsArray, IsInt, Min, MaxLength } from 'class-validator';
import { NoticeSource, NoticeCategory, NoticeStatus, Severity } from '@prisma/client';
import { PartialType } from '@nestjs/mapped-types';

export class CreateNoticeDto {

  @IsEnum(NoticeSource)
  source!: NoticeSource;

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

  @IsEnum(NoticeCategory)
  category!: NoticeCategory;

  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

  @IsOptional()
  @IsEnum(NoticeStatus)
  status?: NoticeStatus; // default OPEN

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
