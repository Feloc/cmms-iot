import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ScheduleServiceOrderDto {
  /** Fecha/hora de ejecución (programación). null => quitar programación */
  @IsOptional()
  @IsString()
  dueDate?: string | null;

  /** Técnico asignado (User.id). null/"" => quitar asignación. undefined => no toca técnico */
  @IsOptional()
  @IsString()
  technicianId?: string | null;

  /** Duración (min) para calendario (resize) */
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMin?: number | null;
}
