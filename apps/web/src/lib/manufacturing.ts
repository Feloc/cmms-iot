export type ManufacturingOrderStatus = 'DRAFT' | 'ENGINEERING' | 'RELEASED' | 'ON_HOLD' | 'CANCELED';
export type ManufacturingMemberFunction = 'RESPONSIBLE' | 'ENGINEERING' | 'REVIEWER' | 'OBSERVER';
export type EngineeringDiscipline = 'MECHANICAL' | 'ELECTRICAL' | 'PNEUMATIC' | 'HYDRAULIC' | 'AUTOMATION' | 'SOFTWARE' | 'QUALITY' | 'GENERAL';
export type EngineeringDocumentType = 'DRAWING' | 'SCHEMATIC' | 'SPECIFICATION' | 'DATASHEET' | 'PROGRAM' | 'MANUAL' | 'CALCULATION' | 'PROCEDURE' | 'OTHER';
export type EngineeringRevisionStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'RELEASED' | 'OBSOLETE';
export type ManufacturingBomRevisionStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'RELEASED' | 'SUPERSEDED';
export type SupplyType = 'STOCK' | 'BUY' | 'MAKE' | 'SUBCONTRACT';
export type PartCriticality = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type EngineeringReleaseStatus = 'DRAFT' | 'RELEASED' | 'SUPERSEDED' | 'CANCELED';
export type ManufacturingSupplyPlanStatus = 'ACTIVE' | 'SUPERSEDED' | 'COMPLETED' | 'CANCELED';
export type ManufacturingSupplyRequirementStatus = 'OPEN' | 'IN_PROGRESS' | 'PARTIAL' | 'FULFILLED' | 'CANCELED';

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
  bomCount: number;
  bomApprovedCount: number;
  bomReleasedCount: number;
  bomLineCount: number;
  engineeringReleaseCount: number;
  currentEngineeringReleaseCode?: string | null;
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

export type ManufacturingBomLine = {
  id: string;
  position: number;
  parentLineId?: string | null;
  parentLine?: { position: number } | null;
  level: number;
  inventoryItemId?: string | null;
  inventoryItem?: { id: string; sku: string; name: string; uom: string; qty: number; status: string } | null;
  itemCode: string;
  description: string;
  quantityPerUnit: number;
  uom: string;
  supplyType: SupplyType;
  isOptional: boolean;
  criticality: PartCriticality;
  drawingDocumentId?: string | null;
  drawingRevisionId?: string | null;
  materialSpecification?: string | null;
  manufacturer?: string | null;
  manufacturerPartNo?: string | null;
  preferredSupplier?: string | null;
  leadTimeDays?: number | null;
  notes?: string | null;
};

export type ManufacturingBomRevision = {
  id: string;
  bomId: string;
  sequence: number;
  revisionCode: string;
  status: ManufacturingBomRevisionStatus;
  changeSummary: string;
  createdByUserId: string;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
  reviewComment?: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  lines?: ManufacturingBomLine[];
  bom?: { id: string; manufacturingOrderId: string; code: string; name: string };
};

export type ManufacturingBom = {
  id: string;
  manufacturingOrderId: string;
  code: string;
  name: string;
  description?: string | null;
  revisions: ManufacturingBomRevision[];
  latestRevision?: ManufacturingBomRevision | null;
  approvedRevision?: ManufacturingBomRevision | null;
  releasedRevision?: ManufacturingBomRevision | null;
};

export type EngineeringReleaseDocument = {
  id: string;
  documentRevisionId: string;
  documentCodeSnapshot: string;
  documentNameSnapshot: string;
  disciplineSnapshot: EngineeringDiscipline;
  revisionCodeSnapshot: string;
  documentRevision: EngineeringDocumentRevision & { document: { id: string; code: string; name: string; discipline: EngineeringDiscipline; active: boolean } };
};

export type EngineeringRelease = {
  id: string;
  manufacturingOrderId: string;
  sequence: number;
  releaseCode: string;
  status: EngineeringReleaseStatus;
  lockVersion: number;
  title: string;
  notes?: string | null;
  bomRevisionId: string;
  bomCodeSnapshot: string;
  bomRevisionCodeSnapshot: string;
  bomLineCountSnapshot: number;
  bomLineCount: number;
  documentCount: number;
  createdByUserId: string;
  releasedAt?: string | null;
  releasedByUserId?: string | null;
  releasedByName?: string | null;
  validationSnapshot?: EngineeringReleaseValidation | null;
  createdAt: string;
  updatedAt: string;
  bomRevision: ManufacturingBomRevision & { bom: { id: string; code: string; name: string } };
  documents: EngineeringReleaseDocument[];
};

export type EngineeringReleaseValidation = {
  valid: boolean;
  errors: Array<{ code: string; message: string; entityId?: string }>;
  warnings: Array<{ code: string; message: string; entityId?: string }>;
  summary: { bomCode: string; bomRevisionCode: string; bomLineCount: number; documentCount: number; releaseCode: string; lockVersion: number };
};

export type ManufacturingSupplyRequirement = {
  id: string;
  supplyPlanId: string;
  bomLineId: string;
  inventoryItemId?: string | null;
  positionSnapshot: number;
  levelSnapshot: number;
  itemCodeSnapshot: string;
  descriptionSnapshot: string;
  uomSnapshot: string;
  quantityPerUnitSnapshot: number;
  orderQuantitySnapshot: number;
  requiredQuantity: number;
  isOptionalSnapshot: boolean;
  included: boolean;
  engineeringSupplyType: SupplyType;
  plannedSupplyType: SupplyType;
  criticalitySnapshot: PartCriticality;
  stockOnHandSnapshot: number;
  stockReservedSnapshot: number;
  stockAvailableSnapshot: number;
  stockCoveredQuantity: number;
  plannedQuantity: number;
  fulfilledQuantity: number;
  status: ManufacturingSupplyRequirementStatus;
  supplier?: string | null;
  externalReference?: string | null;
  expectedAt?: string | null;
  notes?: string | null;
  lockVersion: number;
  inventoryItem?: { id: string; sku: string; name: string; uom: string; qty: number; status: string } | null;
};

export type ManufacturingSupplyPlan = {
  id: string;
  manufacturingOrderId: string;
  engineeringReleaseId: string;
  status: ManufacturingSupplyPlanStatus;
  lockVersion: number;
  releaseCodeSnapshot: string;
  bomCodeSnapshot: string;
  bomRevisionCodeSnapshot: string;
  orderQuantitySnapshot: number;
  generatedByUserId: string;
  generatedByName: string;
  generatedAt: string;
  completedAt?: string | null;
  isCurrentRelease: boolean;
  requirements: ManufacturingSupplyRequirement[];
  summary: { requirementCount: number; includedCount: number; fulfilledCount: number; openCount: number; stockCoveredQuantity: number; stockQuantity: number; buyQuantity: number; makeQuantity: number; subcontractQuantity: number };
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

export const bomRevisionStatusLabel: Record<ManufacturingBomRevisionStatus, string> = {
  DRAFT: 'Borrador', IN_REVIEW: 'En revisión', APPROVED: 'Aprobada', REJECTED: 'Rechazada', RELEASED: 'Liberada', SUPERSEDED: 'Reemplazada',
};

export const bomRevisionStatusClass: Record<ManufacturingBomRevisionStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800', IN_REVIEW: 'bg-sky-100 text-sky-800', APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800', RELEASED: 'bg-violet-100 text-violet-800', SUPERSEDED: 'bg-gray-100 text-gray-500',
};

export const supplyTypeLabel: Record<SupplyType, string> = { STOCK: 'Inventario', BUY: 'Comprar', MAKE: 'Fabricar', SUBCONTRACT: 'Tercero' };
export const criticalityLabel: Record<PartCriticality, string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', CRITICAL: 'Crítica' };

export const engineeringReleaseStatusLabel: Record<EngineeringReleaseStatus, string> = { DRAFT: 'Borrador', RELEASED: 'Vigente', SUPERSEDED: 'Reemplazada', CANCELED: 'Cancelada' };
export const engineeringReleaseStatusClass: Record<EngineeringReleaseStatus, string> = { DRAFT: 'bg-gray-100 text-gray-800', RELEASED: 'bg-emerald-100 text-emerald-800', SUPERSEDED: 'bg-amber-100 text-amber-800', CANCELED: 'bg-red-100 text-red-800' };

export const supplyPlanStatusLabel: Record<ManufacturingSupplyPlanStatus, string> = { ACTIVE: 'Activo', SUPERSEDED: 'Reemplazado', COMPLETED: 'Completado', CANCELED: 'Cancelado' };
export const supplyRequirementStatusLabel: Record<ManufacturingSupplyRequirementStatus, string> = { OPEN: 'Pendiente', IN_PROGRESS: 'En gestión', PARTIAL: 'Parcial', FULFILLED: 'Cubierta', CANCELED: 'Excluida' };
export const supplyRequirementStatusClass: Record<ManufacturingSupplyRequirementStatus, string> = { OPEN: 'bg-amber-100 text-amber-800', IN_PROGRESS: 'bg-sky-100 text-sky-800', PARTIAL: 'bg-violet-100 text-violet-800', FULFILLED: 'bg-emerald-100 text-emerald-800', CANCELED: 'bg-gray-100 text-gray-500' };

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
