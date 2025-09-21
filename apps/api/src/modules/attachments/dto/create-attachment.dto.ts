import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum AttachmentTypeDto {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
}

export class CreateAttachmentDto {
  @IsEnum(AttachmentTypeDto) type!: AttachmentTypeDto;

  @IsString()
  @IsNotEmpty()
  filename!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;
}
