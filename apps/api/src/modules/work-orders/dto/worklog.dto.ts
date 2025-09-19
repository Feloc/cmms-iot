import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class StartWorkDto {
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsBoolean() force?: boolean;  // <- permite “forzar” nuevo tramo
}
export class PauseWorkDto {
  @IsOptional() @IsString() note?: string;
}
export class StopWorkDto {
  @IsOptional() @IsString() note?: string;
}
