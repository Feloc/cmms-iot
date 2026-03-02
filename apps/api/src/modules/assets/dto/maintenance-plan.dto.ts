export type MaintenanceFrequencyUnit = 'DAY' | 'MONTH' | 'YEAR';

export class UpsertAssetMaintenancePlanDto {
  pmPlanId!: string;
  frequencyValue!: number;
  frequencyUnit!: MaintenanceFrequencyUnit;
  lastMaintenanceAt?: string | Date | null;
  planStartAt?: string | Date | null;
  planningHorizonValue?: number;
  planningHorizonUnit?: MaintenanceFrequencyUnit;
  active?: boolean;
  syncFutureOrders?: boolean;
}

export class GenerateAssetMaintenancePlanDto {
  horizonValue?: number;
  horizonUnit?: MaintenanceFrequencyUnit;
}
