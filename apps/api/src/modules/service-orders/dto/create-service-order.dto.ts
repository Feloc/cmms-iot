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

  /** Solo para PREVENTIVO */
  pmPlanId?: string;
}
