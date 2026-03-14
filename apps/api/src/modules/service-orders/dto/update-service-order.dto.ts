export class UpdateServiceOrderDto {
  assetCode?: string;
  title?: string;
  description?: string;

  /**
   * Debe estar alineado con WorkOrderStatus en Prisma.
   * OPEN, SCHEDULED, IN_PROGRESS, ON_HOLD, COMPLETED, CLOSED, CANCELED
   */
  status?: 'OPEN' | 'SCHEDULED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CLOSED' | 'CANCELED';

  serviceOrderType?: 'ALISTAMIENTO' | 'DIAGNOSTICO' | 'PREVENTIVO' | 'CORRECTIVO' | 'ENTREGA' | 'OTRO';
  commercialStatus?: 'PENDING_QUOTE' | 'PENDING_APPROVAL' | 'APPROVED' | 'CONFIRMED' | 'PC' | 'PA' | 'AP' | 'CF' | null;

  pmPlanId?: string | null;
  hasIssue?: boolean;

  /** Duración planificada en minutos (para calendario). */
  durationMin?: number | null;
}
