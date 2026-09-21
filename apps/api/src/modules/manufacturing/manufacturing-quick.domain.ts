import { BadRequestException, ConflictException } from '@nestjs/common';

export type QuickRecipe = {
  name: string; specification: string; drawingRevision: string;
  critical: boolean; stableDesign: boolean; requiresSerial: boolean; inspectionMode: 'LOT' | 'UNIT';
  currency: string; hourlyRate: number;
  materials: { inventoryItemId: string; quantity: number; sku?: string; name?: string; uom?: string }[];
  operations: { name: string; instructions: string; estimatedMinutes: number; evidenceRequired: boolean }[];
  checks: { name: string; criteria: string; type: 'PASS_FAIL' | 'NUMERIC'; min: number | null; max: number | null; evidenceRequired: boolean }[];
};

export function quickText(value: unknown, label: string, required = true): string {
  if (typeof value !== 'string' || value.trim().length > 4000 || (required && !value.trim())) {
    throw new BadRequestException(`${label}: texto ${required ? 'obligatorio' : 'inválido'} (máximo 4000 caracteres)`);
  }
  return value.trim();
}
export function quickNumber(value: unknown, label: string, min = 0, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > 1e9 || (integer && !Number.isInteger(value))) {
    throw new BadRequestException(`${label}: número ${integer ? 'entero ' : ''}mayor o igual a ${min} requerido`);
  }
  return value;
}
function rows(value: unknown, label: string, max: number): any[] {
  if (!Array.isArray(value) || !value.length || value.length > max || value.some(v => !v || typeof v !== 'object')) throw new BadRequestException(`${label}: se requieren entre 1 y ${max} filas`);
  return value;
}
export function validateQuickRecipe(raw: any): QuickRecipe {
  if (!raw || raw.critical !== false || raw.stableDesign !== true) throw new BadRequestException('El flujo abreviado requiere un diseño estable y no crítico');
  const materials = rows(raw.materials, 'Materiales', 30).map(m => ({ inventoryItemId: quickText(m.inventoryItemId, 'Artículo'), quantity: quickNumber(m.quantity, 'Cantidad por pieza', 0.000001) }));
  if (new Set(materials.map(m => m.inventoryItemId)).size !== materials.length) throw new BadRequestException('Consolida los materiales repetidos en una sola línea');
  if (!['LOT', 'UNIT'].includes(raw.inspectionMode)) throw new BadRequestException('Selecciona inspección por lote o unidad');
  const currency = quickText(raw.currency, 'Moneda').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('La moneda debe tener tres letras');
  return {
    name: quickText(raw.name, 'Nombre'), specification: quickText(raw.specification, 'Plano o instrucción'), drawingRevision: quickText(raw.drawingRevision, 'Revisión del plano'),
    critical: false, stableDesign: true, requiresSerial: raw.requiresSerial === true, inspectionMode: raw.inspectionMode,
    currency, hourlyRate: quickNumber(raw.hourlyRate, 'Tarifa horaria'), materials,
    operations: rows(raw.operations, 'Operaciones', 30).map(o => ({ name: quickText(o.name, 'Operación'), instructions: quickText(o.instructions || '', 'Instrucciones', false), estimatedMinutes: quickNumber(o.estimatedMinutes, 'Minutos estimados'), evidenceRequired: o.evidenceRequired === true })),
    checks: rows(raw.checks, 'Controles', 30).map(c => {
      if (!['PASS_FAIL', 'NUMERIC'].includes(c.type)) throw new BadRequestException('Tipo de control inválido');
      const min = c.min == null ? null : quickNumber(c.min, 'Mínimo', -1e9);
      const max = c.max == null ? null : quickNumber(c.max, 'Máximo', -1e9);
      if (c.type === 'NUMERIC' && ((min === null && max === null) || (min !== null && max !== null && min > max))) throw new BadRequestException('Define límites válidos para la medición');
      return { name: quickText(c.name, 'Control'), criteria: quickText(c.criteria, 'Criterio de aceptación'), type: c.type, min, max, evidenceRequired: c.evidenceRequired === true };
    }),
  };
}
export function evaluateQuickInspection(recipe: QuickRecipe, results: any): { passed: boolean; results: any[] } {
  if (!Array.isArray(results) || results.length !== recipe.checks.length) throw new BadRequestException('Registra todos los controles de la receta');
  const checked = recipe.checks.map((check, i) => {
    const result = results[i];
    if (!result || !['PASS', 'FAIL'].includes(result.result)) throw new BadRequestException(`Falta el resultado de ${check.name}`);
    const evidence = quickText(result.evidence || '', 'Evidencia', false);
    if (check.evidenceRequired && !evidence) throw new BadRequestException(`${check.name} requiere evidencia`);
    const value = check.type === 'NUMERIC' ? quickNumber(result.value, check.name, -1e9) : null;
    const passed = value === null ? result.result === 'PASS' : (check.min === null || value >= check.min) && (check.max === null || value <= check.max);
    return { name: check.name, value, result: passed ? 'PASS' : 'FAIL', evidence };
  });
  return { passed: checked.every(c => c.result === 'PASS'), results: checked };
}
export function assertQuickReceipt(quantity: number, accepted: number, received: number) {
  quickNumber(quantity, 'Cantidad a recibir', 1, true);
  if (quantity > accepted - received) throw new ConflictException(`Solo hay ${accepted - received} piezas aprobadas pendientes de recepción`);
}
export function directInstallationQuantity(requested: number, delivered: number, alreadyInstalledDirect: number): number {
  return Math.min(requested, Math.max(0, delivered - alreadyInstalledDirect));
}
