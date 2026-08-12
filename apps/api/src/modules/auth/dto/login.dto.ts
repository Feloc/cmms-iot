import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tenant!: string;

  // Los seeds y varias instalaciones existentes usan dominios internos como
  // `platform-admin@local`. Siguen siendo direcciones válidas para iniciar
  // sesión aunque no tengan un TLD público.
  @IsEmail({ require_tld: false })
  @MaxLength(200)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
