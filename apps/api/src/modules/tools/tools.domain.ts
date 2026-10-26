import { BadRequestException, ConflictException } from '@nestjs/common';

export const stockField = { GOOD: 'availableQty', MAINTENANCE: 'maintenanceQty', DAMAGED: 'damagedQty', RETIRED: 'retiredQty' } as const;
export type ToolStock = { tracking: string; quantity: number; availableQty: number; maintenanceQty: number; damagedQty: number; retiredQty: number };
export function loanedQty(tool: ToolStock) {
  return tool.quantity - tool.availableQty - tool.maintenanceQty - tool.damagedQty - tool.retiredQty;
}
export function validateTool(tracking: string, quantity: number, serialNumber?: string | null) {
  if (tracking === 'UNIT' && quantity !== 1) throw new BadRequestException('Una herramienta individual debe tener cantidad 1');
  if (tracking === 'QUANTITY' && serialNumber) throw new BadRequestException('Registra las herramientas con serial individualmente');
}
export function dateOnly(value?: string | null): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Usa fechas con formato AAAA-MM-DD');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Fecha inválida');
  return date;
}
export function stockChange(tool: ToolStock, from: string, to: string, quantity: number) {
  if (!(from in stockField) || !(to in stockField) || from === 'RETIRED' || from === to) throw new BadRequestException('Cambio de condición inválido');
  const a = stockField[from as keyof typeof stockField], b = stockField[to as keyof typeof stockField];
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > tool[a]) throw new ConflictException('La cantidad supera las unidades en la condición de origen');
  return { [a]: tool[a] - quantity, [b]: tool[b] + quantity };
}

// RFC 4180 fields, with comma or semicolon, BOM and CRLF support. No silent row loss.
export function parseToolCsv(csv: string): Record<string, string>[] {
  const source = csv.replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0];
  const separator = firstLine.includes(';') ? ';' : ',';
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false;
  const pushRow = () => { row.push(field); if (row.some(v => v.trim())) rows.push(row); row = []; field = ''; closed = false; };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === separator) { row.push(field); field = ''; closed = false; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && source[i + 1] === '\n') i++; pushRow(); }
    else if (c === '"' && !field && !closed) quoted = true;
    else { if (closed || c === '"') throw new BadRequestException('CSV: comillas o separadores inválidos'); field += c; }
  }
  if (quoted) throw new BadRequestException('CSV: comillas sin cerrar');
  if (field || row.length) pushRow();
  const headers = rows.shift()?.map(v => v.trim().toLowerCase()) || [];
  const allowed = ['codigo', 'nombre', 'categoria', 'control', 'cantidad', 'marca', 'modelo', 'serial', 'ubicacion', 'responsable_email', 'fecha_compra', 'observaciones'];
  if (new Set(headers).size !== headers.length || headers.some(h => !allowed.includes(h)) || ['codigo', 'nombre', 'control', 'cantidad', 'ubicacion'].some(h => !headers.includes(h))) throw new BadRequestException('CSV: usa los encabezados de la plantilla');
  if (!rows.length || rows.length > 200) throw new BadRequestException('Carga entre 1 y 200 herramientas por archivo');
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new BadRequestException(`CSV: número de columnas incorrecto en fila ${index + 2}`);
    return Object.fromEntries(headers.map((h, i) => [h, values[i].trim()]));
  });
}
