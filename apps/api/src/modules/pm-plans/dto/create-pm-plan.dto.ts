export class CreatePmPlanDto {
  name!: string;

  /** Intervalo en horas: 200, 600, 1200... */
  intervalHours!: number;

  description?: string | null;

  /** Duración por defecto (minutos) para el calendario */
  defaultDurationMin?: number | null;

  /** Checklist/plantilla del preventivo (JSON). Ej: [{label, required}] */
  checklist?: any;

  active?: boolean;
}
