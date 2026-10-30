import { apiFetch, apiBase } from './api';
export const stages: Record<string, string> = { REQUESTED: 'Solicitud recibida', SOURCING: 'Cotizando suministro', QUOTING: 'Preparando cotización', AWAITING_APPROVAL: 'Esperando al cliente', FULFILLMENT: 'En cumplimiento', ON_HOLD: 'En pausa', CLOSED: 'Cerrada', REJECTED: 'Rechazada', CANCELED: 'Cancelada' };
export const areas: Record<string, string> = { TECHNICAL: 'Servicio técnico', PURCHASING: 'Compras', MANUFACTURING: 'Manufactura', WAREHOUSE: 'Almacén', BILLING: 'Facturación', LOGISTICS: 'Logística' };
export const capabilities: Record<string, string> = { READ: 'Consultar todos los expedientes', QUOTE: 'Cotizar y validar aprobación', SOURCE: 'Cotizar proveedores y manufactura', PURCHASE: 'Registrar órdenes de compra', RECEIVE: 'Recibir repuestos', SERVICE: 'Vincular y confirmar servicios', INVOICE: 'Registrar facturas', DISPATCH: 'Despachar y confirmar entregas' };
export const purposes: Record<string, string> = { REQUEST: 'Solicitud del cliente', SUPPLIER_QUOTE: 'Cotización de proveedor / costo interno', CUSTOMER_QUOTE: 'Cotización al cliente y envío', CUSTOMER_PO: 'OC del cliente', SUPPLIER_PO: 'OC al proveedor / orden de fabricación', RECEIPT: 'Recepción del repuesto', SERVICE: 'Informe y conformidad del servicio', INVOICE: 'Factura', DELIVERY: 'Remisión, guía o entrega', OTHER: 'Otra evidencia' };
export const documentKinds: Record<string, string> = { CUSTOMER_PO: 'OC del cliente', PURCHASE: 'OC al proveedor', PRODUCTION: 'Orden de fabricación', RECEIPT: 'Recepción', SERVICE: 'Servicio realizado y aceptado', INVOICE: 'Factura', DISPATCH: 'Despacho', DELIVERY: 'Entrega confirmada' };
export const actionLabels: Record<string, string> = { SOURCE: 'Solicitar costo y plazo', PREPARE: 'Preparar cotización', SEND: 'Registrar envío al cliente', REVISE: 'Registrar ajustes solicitados', APPROVE: 'Validar OC del cliente', REJECT: 'Registrar rechazo', HANDOFF: 'Cambiar responsable', HOLD: 'Poner en pausa', RESUME: 'Retomar expediente', CANCEL: 'Cancelar expediente', CLOSE: 'Cerrar expediente', COMMENT: 'Registrar seguimiento' };
export type Auth = { token?: string; tenantSlug?: string };
export type Permissions = { admin: boolean; manage: boolean; create: boolean; costs: boolean; capabilities: string[] };
export type User = { id: string; name: string; role: string; capabilities: string[] };
export type Metadata = { userId: string; users: User[]; permissions: Permissions };
export type Line = { id?: string; kind: string; route: string; description: string; uom: string; quantity: string; unitPrice: string; taxPct: string; inventoryItemId?: string | null; approvedQty?: string; orderedQty?: string; receivedQty?: string; executedQty?: string; invoicedQty?: string; dispatchedQty?: string; deliveredQty?: string; serviceOrderId?: string | null; manufacturingOrderId?: string | null };
export type Evidence = { id: string; filename: string; purpose: string; revision?: number; createdAt: string; sha256: string };
export type Offer = { id: string; lineId: string; supplier: string; reference: string; unitCost: string; currency: string; leadDays: number; validUntil: string; selected: boolean; evidenceId: string };
export type CommercialDocument = { id: string; kind: string; reference: string; revision: number; date: string; note: string; evidenceId: string; amount?: string; supplier?: string; items: { lineId: string; quantity: string; currency?: string; unitCost?: string }[] };
export type Revision = { number: number; total: string; validUntil: string; terms: string; sentTo: string; createdAt: string; evidenceId: string; snapshot: { customerName: string; customerTaxId?: string; contactName: string; currency: string; title: string; description: string; lines: Line[] } };
export type Quotation = { id: string; code: string; title: string; description: string; customerName: string; contactName: string; contactEmail?: string; contactPhone?: string; customerTaxId?: string; currency: string; coordinatorId: string; responsibleId: string; area: string; dueAt?: string; status: string; version: number; currentRevision: number; approvedRevision?: number; lines: Line[]; total: string; progress: { procurement: number; reception: number; service: number; invoice: number; delivery: number; complete: boolean }; offers: Offer[]; documents: CommercialDocument[]; attachments: Evidence[]; revisions: Revision[]; permissions: Permissions; updatedAt: string };
export type CaseList = { items: Quotation[]; total: number; page: number; pages: number; permissions: Permissions };
export type History = { items: { id: string; action: string; actorName: string; note: string; createdAt: string; details: Record<string, unknown> }[]; total: number; pages: number };
export const input = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100';
export const emptyLine = (): Line => ({ kind: 'PART', route: 'BUY', description: '', uom: 'UND', quantity: '1', unitPrice: '0', taxPct: '0' });
export function errorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  try { const body = JSON.parse(text.slice(text.indexOf('{'))); return Array.isArray(body.message) ? body.message.join('. ') : body.message || text; } catch { return text; }
}
export const date = (value?: string) => value ? new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha';
export const money = (value: string | number, currency = 'COP') => new Intl.NumberFormat('es-CO', { style: 'currency', currency }).format(Number(value));
export const terminal = (status: string) => ['CLOSED', 'REJECTED', 'CANCELED'].includes(status);
export function save<T>(path: string, auth: Auth, body: unknown, method = 'POST') { return apiFetch<T>(path, { ...auth, method, body }); }
export async function download(id: string, file: Evidence, auth: Auth) {
  const response = await fetch(`${apiBase}/quotations/${id}/attachments/${file.id}/download`, { headers: { Authorization: `Bearer ${auth.token}` } });
  if (!response.ok) throw new Error('No fue posible descargar la evidencia');
  const url = URL.createObjectURL(await response.blob()), a = document.createElement('a'); a.href = url; a.download = file.filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
