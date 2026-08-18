export type ManufacturingOrderStatus = 'DRAFT' | 'ENGINEERING' | 'RELEASED' | 'ON_HOLD' | 'CANCELED';
export type ManufacturingMemberFunction = 'RESPONSIBLE' | 'ENGINEERING' | 'REVIEWER' | 'OBSERVER';
export type EngineeringDiscipline = 'MECHANICAL' | 'ELECTRICAL' | 'PNEUMATIC' | 'HYDRAULIC' | 'AUTOMATION' | 'SOFTWARE' | 'QUALITY' | 'GENERAL';
export type EngineeringDocumentType = 'DRAWING' | 'SCHEMATIC' | 'SPECIFICATION' | 'DATASHEET' | 'PROGRAM' | 'MANUAL' | 'CALCULATION' | 'PROCEDURE' | 'OTHER';
export type EngineeringRevisionStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'RELEASED' | 'OBSOLETE';

export type ManufacturingUser = {
  id: string;
  name: string;
  email?: string;
  role?: string;
};

export type ManufacturedUnit = {
  id: string;
  unitNumber: number;
  serialNumber?: string | null;
  internalCode?: string | null;
  status: 'PLANNED' | 'CANCELED';
  assetId?: string | null;
  updatedAt: string;
};

export type ManufacturingOrderMember = {
  id: string;
  userId: string;
  function: ManufacturingMemberFunction;
  user: ManufacturingUser;
};

export type ManufacturingMetrics = {
  unitCount: number;
  memberCount: number;
  engineeringDocumentCount: number;
  engineeringApprovedCount: number;
  engineeringReleasedCount: number;
  pendingEngineeringChanges: boolean;
};

export type ManufacturingOrder = {
  id: string;
  number: string;
  status: ManufacturingOrderStatus;
  statusBeforeHold?: ManufacturingOrderStatus | null;
  version: number;
  projectName: string;
  productCode?: string | null;
  productName: string;
  model?: string | null;
  quantity: number;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | null;
  customerName?: string | null;
  customerReference?: string | null;
  commercialReference?: string | null;
  destination?: string | null;
  description?: string | null;
  requestedDeliveryAt?: string | null;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  responsibleUserId: string;
  responsibleUser: ManufacturingUser;
  createdByUser?: { id: string; name: string };
  holdReason?: string | null;
  canceledReason?: string | null;
  releasedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  units?: ManufacturedUnit[];
  members?: ManufacturingOrderMember[];
  metrics: ManufacturingMetrics;
};

export type ManufacturingAuditEvent = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  actorName: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type EngineeringDocumentRevision = {
  id: string;
  sequence: number;
  revisionCode: string;
  status: EngineeringRevisionStatus;
  changeSummary: string;
  sourceFilename: string;
  fileSha256: string;
  createdByUserId: string;
  submittedAt?: string | null;
  submittedByUserId?: string | null;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
  reviewComment?: string | null;
  releasedAt?: string | null;
  releasedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  fileAttachment: { id: string; filename: string; mimeType: string; size: number; createdAt: string };
};

export type EngineeringDocument = {
  id: string;
  manufacturingOrderId: string;
  code: string;
  name: string;
  discipline: EngineeringDiscipline;
  documentType: EngineeringDocumentType;
  systemName?: string | null;
  description?: string | null;
  active: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  revisions: EngineeringDocumentRevision[];
  latestRevision?: EngineeringDocumentRevision | null;
  approvedRevision?: EngineeringDocumentRevision | null;
  releasedRevision?: EngineeringDocumentRevision | null;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
};

export const manufacturingStatusLabel: Record<ManufacturingOrderStatus, string> = {
  DRAFT: 'Borrador',
  ENGINEERING: 'Ingeniería',
  RELEASED: 'Liberada',
  ON_HOLD: 'En pausa',
  CANCELED: 'Cancelada',
};

export const manufacturingStatusClass: Record<ManufacturingOrderStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ENGINEERING: 'bg-sky-100 text-sky-800',
  RELEASED: 'bg-emerald-100 text-emerald-800',
  ON_HOLD: 'bg-amber-100 text-amber-900',
  CANCELED: 'bg-red-100 text-red-800',
};

export const memberFunctionLabel: Record<ManufacturingMemberFunction, string> = {
  RESPONSIBLE: 'Responsable',
  ENGINEERING: 'Ingeniería',
  REVIEWER: 'Revisor',
  OBSERVER: 'Observador',
};

export const engineeringDisciplineLabel: Record<EngineeringDiscipline, string> = {
  MECHANICAL: 'Mecánica', ELECTRICAL: 'Eléctrica', PNEUMATIC: 'Neumática', HYDRAULIC: 'Hidráulica',
  AUTOMATION: 'Automatización', SOFTWARE: 'Software', QUALITY: 'Calidad', GENERAL: 'General',
};

export const engineeringDocumentTypeLabel: Record<EngineeringDocumentType, string> = {
  DRAWING: 'Plano', SCHEMATIC: 'Esquema', SPECIFICATION: 'Especificación', DATASHEET: 'Ficha técnica',
  PROGRAM: 'Programa', MANUAL: 'Manual', CALCULATION: 'Cálculo', PROCEDURE: 'Procedimiento', OTHER: 'Otro',
};

export const engineeringRevisionStatusLabel: Record<EngineeringRevisionStatus, string> = {
  DRAFT: 'Borrador', IN_REVIEW: 'En revisión', APPROVED: 'Aprobada', REJECTED: 'Rechazada', RELEASED: 'Liberada', OBSOLETE: 'Obsoleta',
};

export const engineeringRevisionStatusClass: Record<EngineeringRevisionStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800', IN_REVIEW: 'bg-sky-100 text-sky-800', APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800', RELEASED: 'bg-violet-100 text-violet-800', OBSOLETE: 'bg-gray-100 text-gray-500',
};

export function dateLabel(value?: string | null, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return withTime ? date.toLocaleString('es-CO') : date.toLocaleDateString('es-CO');
}

export function localDateInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
