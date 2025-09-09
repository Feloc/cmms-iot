import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAssetDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  code!: string;

  @IsString() @IsNotEmpty() @MaxLength(128)
  name!: string;

  @IsString() @IsOptional() @MaxLength(64)
  type?: string;

  @IsString() @IsOptional() @MaxLength(128)
  location?: string;
}
