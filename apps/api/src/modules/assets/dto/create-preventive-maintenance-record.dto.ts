export class CreatePreventiveMaintenanceRecordDto {
  pmPlanId!: string;
  executedAt!: string | Date;
  note?: string | null;
}
