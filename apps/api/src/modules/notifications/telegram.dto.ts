import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class TelegramPreferencesDto {
  @IsBoolean() enabled!: boolean;
  @IsBoolean() automatic!: boolean;
}

export class TelegramMessageDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique()
  @IsString({ each: true }) @MaxLength(100, { each: true })
  userIds!: string[];

  @IsString() @MinLength(1) @MaxLength(4000)
  text!: string;

  @IsUUID('4') requestId!: string;
}
