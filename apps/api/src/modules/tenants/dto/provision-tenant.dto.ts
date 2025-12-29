import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ProvisionTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  adminName!: string;

  @IsEmail()
  @MaxLength(200)
  adminEmail!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(200)
  adminPassword!: string;
}
