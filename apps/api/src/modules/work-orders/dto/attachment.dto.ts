import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AttachmentKind } from '@prisma/client';

export class CreateAttachmentDto {
  @IsEnum(AttachmentKind) kind!: AttachmentKind;
  @IsString() url!: string;
  @IsOptional() @IsString() label?: string;
  @IsOptional() meta?: any;
}
