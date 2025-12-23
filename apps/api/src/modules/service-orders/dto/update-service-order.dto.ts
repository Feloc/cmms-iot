export class UpdateServiceOrderDto {
  title?: string;
  description?: string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  serviceOrderType?: 'ALISTAMIENTO' | 'DIAGNOSTICO' | 'PREVENTIVO' | 'CORRECTIVO' | 'ENTREGA' | 'OTRO';
  pmPlanId?: string | null;
  hasIssue?: boolean;
  durationMin?: number | null;
}
