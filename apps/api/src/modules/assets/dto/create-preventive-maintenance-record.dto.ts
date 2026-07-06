export class CreatePreventiveMaintenanceRecordDto {
  pmPlanId!: string;
  executedAt!: string | Date;
  note?: string | null;
  hourmeterReading?: number | string | null;
  allowHourmeterDecrease?: boolean | null;
}
