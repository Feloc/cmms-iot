export const engineeringStatuses: Record<string, string> = {
  DRAFT: 'Borrador', SUBMITTED: 'Solicitada', NEEDS_INFO: 'Información pendiente', STUDY: 'En estudio',
  REVIEW: 'En revisión', APPROVED: 'Aprobada', EXECUTION: 'En ejecución', VALIDATION: 'En validación',
  CLOSED: 'Cerrada', REJECTED: 'Rechazada', CANCELED: 'Cancelada', ON_HOLD: 'En espera',
};
export const requestTypes: Record<string, string> = { REFORM: 'Reforma', IMPROVEMENT: 'Mejora', ADAPTATION: 'Adaptación', OBSOLESCENCE: 'Obsolescencia' };
export const disciplines: Record<string, string> = { GENERAL: 'General', MECHANICAL: 'Mecánica', ELECTRICAL: 'Eléctrica', PNEUMATIC: 'Neumática', HYDRAULIC: 'Hidráulica', AUTOMATION: 'Automatización', SOFTWARE: 'Software', QUALITY: 'Calidad' };
export const priorities: Record<string, string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', URGENT: 'Urgente' };
export const actionLabels: Record<string, string> = {
  submit: 'Enviar solicitud', 'authorize-study': 'Autorizar estudio', 'request-info': 'Solicitar información',
  'submit-review': 'Enviar a revisión', approve: 'Aprobar ejecución', revise: 'Devolver a estudio', reject: 'Rechazar',
  start: 'Iniciar ejecución', validate: 'Enviar a validación', close: 'Validar y cerrar', rework: 'Solicitar corrección',
  hold: 'Poner en espera', resume: 'Retomar', cancel: 'Cancelar solicitud',
  created: 'Solicitud creada', 'proposal-saved': 'Propuesta guardada', 'request-updated': 'Solicitud actualizada',
  'order-linked': 'Orden vinculada', 'order-unlinked': 'Orden desvinculada', 'file-added': 'Archivo adjunto', comment: 'Comentario',
};
export type EngineeringAsset = { id: string; code: string; name: string; serialNumber?: string | null; customer?: string | null };
export type EngineeringUser = { id: string; name: string; role: string };
export type RequestFields = { title: string; problem: string; expectedBenefit: string; requestType: string; discipline: string; priority: string; desiredDate: string };
export type Proposal = { solution: string; scope: string; materials: string; estimatedCost: number; currency: string; downtimeHours: number; acceptanceCriteria: string; documentImpact: string };
export const emptyProposal: Proposal = { solution: '', scope: '', materials: '', estimatedCost: 0, currency: 'COP', downtimeHours: 0, acceptanceCriteria: '', documentImpact: '' };
export type EngineeringOrder = { id: string; title: string; status: string; kind: string };
export type EngineeringFile = { id: string; filename: string; size: number; createdAt: string };
export type EngineeringRequest = RequestFields & {
  id: string; number: string; assetId: string; asset: EngineeringAsset; assetSnapshot: EngineeringAsset;
  status: string; version: number; requestedByUserId: string; responsibleUserId?: string;
  reviewerUserId?: string; validatorUserId?: string; originWorkOrderId?: string; originNoticeId?: string;
  proposal: Proposal | null; proposalAuthorId?: string; approvedRevision?: number; updatedAt: string;
  revisions: { id: string; revision: number; createdAt: string; snapshot: { proposal: Proposal; attachments: EngineeringFile[] } }[];
  events: { id: string; action: string; actorName: string; note?: string; createdAt: string; toStatus: string; details?: Record<string, any> }[];
  orders: { id: string; workOrder: EngineeringOrder }[];
  attachments: EngineeringFile[];
};
export const engineeringInput = 'w-full min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-600';
export function engineeringError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  try {
    const body = JSON.parse(message.slice(message.indexOf('{')));
    if (body.message) return Array.isArray(body.message) ? body.message.join('. ') : String(body.message);
  } catch {}
  return 'No se pudo completar la operación. Recarga para comprobar el estado actual.';
}
export function engineeringDate(date?: string) {
  return date ? new Date(date).toLocaleString('es-CO') : '-';
}
