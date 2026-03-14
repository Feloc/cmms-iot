export class CreateServiceOrderDto {
  /** Asset code (se elige buscando por serie/cliente desde el frontend) */
  assetCode!: string;

  /** Tipo de Orden de Servicio */
  serviceOrderType!: 'ALISTAMIENTO' | 'DIAGNOSTICO' | 'PREVENTIVO' | 'CORRECTIVO' | 'ENTREGA' | 'OTRO';

  /** Título opcional (si no viene, se autogenera en backend) */
  title?: string;
  description?: string;

  /** Fecha/hora programada de ejecución */
  dueDate?: string | Date;

  /** Duración planificada en minutos (para calendario). Default recomendado: 60 */
  durationMin?: number;

  /** Estado comercial / de negociación con el cliente */
  commercialStatus?: 'PENDING_QUOTE' | 'PENDING_APPROVAL' | 'APPROVED' | 'CONFIRMED' | 'PC' | 'PA' | 'AP' | 'CF' | null;

  /** Solo para PREVENTIVO */
  pmPlanId?: string;
}
