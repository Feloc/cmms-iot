export type AssemblyMetrics = {
  progressPercent: number;
  actualLaborMinutes: number;
  budgetConsumedPercent: number;
  forecastLaborMinutes: number;
};

export type AssemblyActivity = {
  id: string;
  position: number;
  phase?: string | null;
  name: string;
  instructions?: string | null;
  estimatedMinutes: number;
  plannedTechnicians: number;
  required: boolean;
  evidenceRequired: boolean;
  status: string;
  progressPercent: number;
  notes?: string | null;
  blockedReason?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  actualMinutes: number;
  varianceMinutes: number;
  workLogs?: Array<{ id: string; userId: string; startedAt: string; endedAt?: string | null; user?: { name: string } | null }>;
};

export type Assembly = {
  id: string;
  status: string;
  templateName: string;
  templateVersion: number;
  plannedMinutes: number;
  plannedLaborMinutes: number;
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
    required: boolean;
    evidenceRequired: boolean;
  }>;
};

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

