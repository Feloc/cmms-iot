export class ScheduleServiceOrderDto {
  /**
   * Fecha/hora de ejecución (programación)
   * - undefined: no cambia
   * - null: desprograma
   * - string/Date: programa
   */
  dueDate?: string | Date | null;

  /**
   * Técnico asignado (User.id)
   * - undefined: no cambia
   * - "" o null: quita asignación
   */
  technicianId?: string | null;

  /**
   * Duración planificada en minutos (para calendario)
   * - undefined: no cambia
   * - null: limpia (se usará default del frontend, p.e. 60)
   */
  durationMin?: number | null;
}
