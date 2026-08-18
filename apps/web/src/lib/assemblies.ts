export type AssemblyMetrics = {
  progressPercent: number;
  actualLaborMinutes: number;
  budgetConsumedPercent: number;
  forecastLaborMinutes: number;
  baselineStartAt: string;
  baselineEndAt: string;
  riskLevel: AssemblyRiskLevel;
  blockedActivities: number;
  overdueActivities: number;
  dueSoonActivities: number;
  laborRisk: boolean;
  pendingSignature: boolean;
  nextActivityDueAt?: string | null;
  riskUpdatedAt: string;
};

export type AssemblyRiskLevel = 'CRITICAL' | 'WARNING' | 'ON_TRACK' | 'DONE';
export type AssemblyOperationalAlert = { code: 'BLOCKED' | 'OVERDUE' | 'DUE_SOON' | 'LABOR_RISK' | 'LABOR_OVERRUN' | 'PENDING_SIGNATURE'; severity: 'CRITICAL' | 'WARNING'; message: string; count?: number };
export type AssemblyPersistentAlert = {
  id: string;
  executionId: string;
  activityId?: string | null;
  code: string;
  severity: 'CRITICAL' | 'WARNING';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  message: string;
  assignedUserId?: string | null;
  acknowledgedAt?: string | null;
  acknowledgedByName?: string | null;
  resolvedAt?: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  escalationLevel: number;
  escalatedAt?: string | null;
};

export type AssemblyActivity = {
  id: string;
  position: number;
  phase?: string | null;
  name: string;
  instructions?: string | null;
  estimatedMinutes: number;
  plannedTechnicians: number;
  dependsOnPositions: number[];
  required: boolean;
  evidenceRequired: boolean;
  status: string;
  progressPercent: number;
  notes?: string | null;
  blockedReason?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  plannedStartAt: string;
  plannedEndAt: string;
  actualElapsedMinutes: number;
  scheduleVarianceMinutes: number;
  actualMinutes: number;
  varianceMinutes: number;
  riskLevel: AssemblyRiskLevel;
  alerts: AssemblyOperationalAlert[];
  workLogs?: Array<{ id: string; userId: string; startedAt: string; endedAt?: string | null; user?: { name: string } | null }>;
  attachments?: Array<{ id: string; type: string; filename: string; mimeType: string; size: number; createdBy: string; createdAt: string }>;
};

export type AssemblyScheduleRevision = {
  id: string;
  version: number;
  reason: string;
  createdByUserId: string;
  createdByName: string;
  baselineStartAt: string;
  baselineEndAt: string;
  createdAt: string;
  snapshot: {
    scheduledStartAt?: string | null;
    scheduleTimezone: string;
    workdayStartMinute: number;
    workdayEndMinute: number;
    workingDays: number[];
    excludedDates: string[];
    plannedMinutes: number;
    plannedLaborMinutes: number;
    baselineStartAt: string;
    baselineEndAt: string;
    activities: Array<{
      id: string;
      position: number;
      name: string;
      estimatedMinutes: number;
      plannedTechnicians: number;
      dependsOnPositions: number[];
      plannedStartAt?: string | null;
      plannedEndAt?: string | null;
    }>;
  };
};

export type Assembly = {
  id: string;
  status: string;
  templateName: string;
  templateVersion: number;
  plannedMinutes: number;
  plannedLaborMinutes: number;
  scheduledStartAt?: string | null;
  scheduleTimezone: string;
  workdayStartMinute: number;
  workdayEndMinute: number;
  workingDays: number[];
  excludedDates: string[];
  scheduleVersion: number;
  scheduleRevisions?: AssemblyScheduleRevision[];
  operationalAlerts: AssemblyOperationalAlert[];
  persistentAlerts: AssemblyPersistentAlert[];
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
  metrics: AssemblyMetrics;
  asset?: { id?: string; code: string; name: string; customer?: string | null; brand?: string | null; model?: string | null; serialNumber?: string | null } | null;
  workOrder: {
    id: string;
    assetCode: string;
    title: string;
    description?: string | null;
    status: string;
    dueDate?: string | null;
    completedAt?: string | null;
    technicianSignature?: string | null;
    receiverSignature?: string | null;
    assignments: Array<{ userId: string; user?: { id: string; name: string; email?: string } | null }>;
  };
  activities: AssemblyActivity[];
};

export type AssemblyTemplate = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  version: number;
  active: boolean;
  steps: Array<{
    id: string;
    position: number;
    phase?: string | null;
    name: string;
    instructions?: string | null;
    estimatedMinutes: number;
    plannedTechnicians: number;
    dependsOnPositions: number[];
    required: boolean;
    evidenceRequired: boolean;
  }>;
};

export function criticalPathMinutes(steps: Array<{ position: number; estimatedMinutes: number; dependsOnPositions?: number[] }>) {
  const finishes = new Map<number, number>();
  for (const step of [...steps].sort((a, b) => a.position - b.position)) {
    const predecessor = step.dependsOnPositions?.length
      ? Math.max(...step.dependsOnPositions.map((position) => finishes.get(position) || 0))
      : 0;
    finishes.set(step.position, predecessor + Math.max(1, Number(step.estimatedMinutes || 0)));
  }
  return Math.max(0, ...finishes.values());
}

export function minutesLabel(value: number) {
  const minutes = Math.max(0, Math.round(value || 0));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export const assemblyStatusLabel: Record<string, string> = {
  PLANNED: 'Planificado',
  IN_PROGRESS: 'En ejecución',
  ON_HOLD: 'En pausa',
  COMPLETED: 'Completado',
  CANCELED: 'Cancelado',
  PENDING: 'Pendiente',
  PAUSED: 'Pausada',
  BLOCKED: 'Bloqueada',
  NOT_APPLICABLE: 'No aplica',
};
