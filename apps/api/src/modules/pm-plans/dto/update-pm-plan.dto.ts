export class UpdatePmPlanDto {
  name?: string | null;
  intervalHours?: number;
  description?: string | null;
  defaultDurationMin?: number | null;
  checklist?: any;
  active?: boolean;
}
