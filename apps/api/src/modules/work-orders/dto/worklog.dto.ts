import { IsOptional, IsString } from 'class-validator';

export class StartWorkDto {
  @IsOptional() @IsString() note?: string;
}
export class PauseWorkDto {
  @IsOptional() @IsString() note?: string;
}
export class StopWorkDto {
  @IsOptional() @IsString() note?: string;
}
