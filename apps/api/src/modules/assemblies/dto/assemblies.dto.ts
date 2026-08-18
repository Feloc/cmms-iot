export type AssemblyTemplateStepInput = {
  phase?: string | null;
  name: string;
  instructions?: string | null;
  estimatedMinutes: number;
  plannedTechnicians?: number;
  dependsOnPositions?: number[];
  required?: boolean;
  evidenceRequired?: boolean;
};

export class CreateAssemblyTemplateDto {
  code!: string;
  name!: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  version?: number;
  active?: boolean;
  steps!: AssemblyTemplateStepInput[];
}

export class UpdateAssemblyTemplateDto {
  name?: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  active?: boolean;
  steps?: AssemblyTemplateStepInput[];
}

export class CreateAssemblyDto {
  assetCode!: string;
  templateId!: string;
  title?: string;
  description?: string;
  dueDate?: string | Date;
  scheduledStartAt?: string | Date;
  scheduleTimezone?: string;
  workdayStartMinute?: number;
  workdayEndMinute?: number;
  workingDays?: number[];
  excludedDates?: string[];
  technicianIds?: string[];
}

export class UpdateAssemblyActivityDto {
  progressPercent?: number;
  notes?: string | null;
  assignedUserId?: string | null;
}

export class BlockAssemblyActivityDto {
  reason!: string;
  notes?: string | null;
}

export class CompleteAssemblyActivityDto {
  notes?: string | null;
}

export class UpdateAssemblySignaturesDto {
  technicianSignature?: string | null;
  receiverSignature?: string | null;
}

export type AssemblyScheduleActivityInput = {
  id: string;
  estimatedMinutes: number;
  dependsOnPositions: number[];
};

export class UpdateAssemblyScheduleDto {
  reason!: string;
  scheduledStartAt!: string | Date;
  scheduleTimezone?: string;
  workdayStartMinute?: number;
  workdayEndMinute?: number;
  workingDays?: number[];
  excludedDates?: string[];
  activities!: AssemblyScheduleActivityInput[];
}

export class UpdateAssemblyOperationalAlertDto {
  assignedUserId?: string | null;
  acknowledge?: boolean;
}
