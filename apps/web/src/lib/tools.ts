export type ToolUser = { id: string; name: string; email: string };
export type ToolAuth = { token?: string; tenantSlug?: string };
export type Tool = {
  id: string; code: string; name: string; category: string | null; tracking: 'UNIT' | 'QUANTITY';
  quantity: number; availableQty: number; loanedQty: number; maintenanceQty: number; damagedQty: number; retiredQty: number;
  brand: string | null; model: string | null; serialNumber: string | null; location: string;
  responsibleUserId: string | null; acquiredOn: string | null; notes: string | null; version: number;
  photo: { updatedAt: string } | null;
};
export type ToolLoan = {
  id: string; quantity: number; returnedQty: number; recipientName: string; recipientUserId: string;
  destination: string; expectedReturnOn: string | null; createdAt: string; returnedAt: string | null;
  deliveredByName: string; note: string | null;
};
export type ToolEvent = { id: string; action: string; actorName: string; note: string | null; createdAt: string; details: Record<string, any> };
export type ToolPermissions = { manage: boolean; operate: boolean };
export type ToolDetail = Tool & { loans: ToolLoan[]; closedLoans: ToolLoan[]; responsible: { id: string; name: string } | null; permissions: ToolPermissions };
export type ToolList = { items: Tool[]; total: number; page: number; pages: number; stats: Pick<Tool, 'quantity' | 'availableQty' | 'loanedQty' | 'maintenanceQty' | 'damagedQty' | 'retiredQty'>; permissions: ToolPermissions };
export const toolInput = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100';
export const toolConditions: Record<string, string> = { GOOD: 'Buena / disponible', MAINTENANCE: 'En mantenimiento', DAMAGED: 'Dañada', RETIRED: 'Dada de baja' };
export const toolActions: Record<string, string> = { created: 'Registro', imported: 'Importación', edited: 'Actualización de ficha', lent: 'Entrega', returned: 'Devolución', condition_changed: 'Cambio de condición', received: 'Ingreso de unidades', photo_updated: 'Fotografía actualizada' };
export function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : 'No se pudo completar la operación';
  const json = message.indexOf('{');
  if (json >= 0) { try { const parsed = JSON.parse(message.slice(json)); return Array.isArray(parsed.message) ? parsed.message.join('. ') : parsed.message || message; } catch {} }
  return message.startsWith('API ') ? 'No se pudo completar la operación. Intenta actualizar la página.' : message;
}
export function toolDate(value?: string | null, time = false) {
  if (!value) return '—';
  if (!time) { const [year, month, day] = value.slice(0, 10).split('-'); return `${day}/${month}/${year}`; }
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
export function toolOverdue(loan: ToolLoan) {
  return !loan.returnedAt && !!loan.expectedReturnOn && loan.expectedReturnOn.slice(0, 10) < new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(new Date());
}
