export type ResumableManufacturingStatus = 'DRAFT' | 'ENGINEERING' | 'RELEASED';

export function formatManufacturingOrderNumber(year: number, sequence: number) {
  if (!Number.isInteger(year) || year < 2000) throw new Error('Invalid manufacturing order year');
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('Invalid manufacturing order sequence');
  return `OF-${year}-${String(sequence).padStart(5, '0')}`;
}

export function resumableManufacturingStatus(value: unknown): ResumableManufacturingStatus {
  const status = String(value || '').toUpperCase();
  if (status === 'ENGINEERING' || status === 'RELEASED') return status;
  return 'DRAFT';
}

const ENGINEERING_FILE_EXTENSIONS = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.csv', '.xls', '.xlsx', '.doc', '.docx',
  '.zip', '.dwg', '.dxf', '.step', '.stp', '.ste', '.iges', '.igs', '.xml', '.json', '.yaml', '.yml',
  '.zap', '.zap13', '.zap14', '.zap15', '.zap16', '.zap17', '.zap18', '.zap19', '.ap', '.project',
]);

export function normalizeEngineeringCode(value: unknown) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '-');
}

export function isAllowedEngineeringFilename(filename: unknown) {
  const normalized = String(filename || '').trim().toLowerCase();
  const dot = normalized.lastIndexOf('.');
  return dot >= 0 && ENGINEERING_FILE_EXTENSIONS.has(normalized.slice(dot));
}

export function bomHierarchyLevels(lines: Array<{ position: number; parentPosition?: number | null }>) {
  const levels = new Map<number, number>();
  for (const line of [...lines].sort((a, b) => a.position - b.position)) {
    if (!Number.isInteger(line.position) || line.position < 1) throw new Error('position debe ser entero positivo');
    if (levels.has(line.position)) throw new Error(`Posición duplicada: ${line.position}`);
    if (line.parentPosition === undefined || line.parentPosition === null) levels.set(line.position, 0);
    else {
      if (!Number.isInteger(line.parentPosition) || line.parentPosition >= line.position || !levels.has(line.parentPosition)) {
        throw new Error(`Línea ${line.position}: parentPosition debe referir una posición anterior`);
      }
      levels.set(line.position, Number(levels.get(line.parentPosition)) + 1);
    }
  }
  return levels;
}
