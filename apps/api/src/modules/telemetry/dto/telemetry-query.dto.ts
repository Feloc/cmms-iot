import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';

export class TelemetryQueryDto {
  /** Metric name, e.g. "rms_g", "temp_c" */
  @IsString()
  metric!: string;

  /** From datetime ISO (inclusive). Defaults: now-24h */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** To datetime ISO (exclusive). Defaults: now */
  @IsOptional()
  @IsISO8601()
  to?: string;

  /** Downsample bucket. "raw" usa v_telemetry; "5m" usa v_telemetry_5m */
  @IsOptional()
  @IsEnum(['raw', '5m'] as const)
  bucket?: 'raw' | '5m';

  /** Optional limit for raw points (safety) */
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  limit?: number;
}
