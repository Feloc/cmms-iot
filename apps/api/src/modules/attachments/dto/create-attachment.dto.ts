import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum AttachmentType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
}

export class AttachmentTypeDto {
  @IsEnum(AttachmentType)
  type!: AttachmentType;

  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;
}
