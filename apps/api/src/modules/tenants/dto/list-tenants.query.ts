import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListTenantsQuery {
  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @IsString()
  q?: string;

  @Transform(({ value }) => parseInt(value ?? '1', 10))
  @IsInt()
  @Min(1)
  page: number = 1;

  @Transform(({ value }) => parseInt(value ?? '50', 10))
  @IsInt()
  @Min(1)
  @Max(200)
  size: number = 50;
}
