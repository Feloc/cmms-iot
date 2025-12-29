import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Role } from '@prisma/client';

export class ListAdminUsersQuery {
  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) => String(value).trim().toUpperCase())
  @IsEnum(Role)
  role?: Role;

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
