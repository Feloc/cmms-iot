import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import type { CreateManufacturingFatTemplateDto } from './dto/manufacturing-fat.dto';

export const FAT_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const FAT_IMPORT_MAX_CASES = 500;
type FatCase = CreateManufacturingFatTemplateDto['cases'][number];
const normalize = (value: unknown) => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_-]+/g, '');
type ImportField = keyof FatCase | 'parentPosition';
const columns: Record<string, ImportField> = Object.create(null);
for (const [field, aliases] of Object.entries({
  position: ['posicion', 'orden'], section: ['seccion'], name: ['nombre', 'caso', 'prueba'],
  instructions: ['instrucciones'], acceptanceCriteria: ['criterio', 'criterio_aceptacion', 'criterio_de_aceptacion'],
  resultType: ['tipo', 'tipo_resultado'], minimumValue: ['minimo'], maximumValue: ['maximo'],
  unit: ['unidad'], required: ['obligatorio'], evidenceRequired: ['evidencia', 'evidencia_obligatoria'],
  parentPosition: ['punto_padre', 'posicion_padre', 'padre', 'parent_position'],
})) for (const alias of [field, ...aliases]) columns[normalize(alias)] = field as ImportField;

export function previewFatProtocol(file?: { originalname: string; buffer: Buffer }) {
  if (!file?.buffer?.length) throw new BadRequestException('Selecciona un archivo con casos de prueba');
  if (file.buffer.length > FAT_IMPORT_MAX_BYTES) throw new BadRequestException('El archivo supera 2 MB');
  const extension = file.originalname.split('.').pop()?.toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(extension || '')) throw new BadRequestException('Solo se permiten Excel (.xlsx, .xls) y CSV');
  if (extension === 'xlsx' && (file.buffer.length < 2 || file.buffer.readUInt16LE(0) !== 0x4b50)) throw new BadRequestException('El archivo no es un Excel XLSX válido');
  if (extension === 'xls' && file.buffer.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1') throw new BadRequestException('El archivo no es un Excel XLS válido');
  let workbook: XLSX.WorkBook;
  try {
    const input = extension === 'csv' ? new TextDecoder('utf-8', { fatal: true }).decode(file.buffer) : file.buffer;
    if (typeof input === 'string' && input.includes('\0')) throw new Error('Invalid CSV');
    workbook = XLSX.read(input, { type: extension === 'csv' ? 'string' : 'buffer', raw: true, cellFormula: true, sheetRows: FAT_IMPORT_MAX_CASES + 2 });
  } catch { throw new BadRequestException('No se pudo leer el archivo. Usa un Excel sin contraseña o un CSV UTF-8'); }
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet?.['!ref']) throw new BadRequestException('La primera hoja está vacía');
  if (sheet['!merges']?.length) throw new BadRequestException('No se admiten celdas combinadas; usa una fila independiente por punto o subpunto');
  const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref']);
  if (range.e.r > FAT_IMPORT_MAX_CASES || range.e.c > 19) throw new BadRequestException('Se permiten hasta 500 casos y 20 columnas, con encabezados en la primera fila');
  const headers = Array.from({ length: range.e.c + 1 }, (_, c) => String(sheet[XLSX.utils.encode_cell({ r: 0, c })]?.v ?? '').trim());
  if (headers.some((header, c) => sheet[XLSX.utils.encode_cell({ r: 0, c })]?.f || header.startsWith('='))) throw new BadRequestException('Los encabezados no admiten fórmulas; pega valores');
  const fields = headers.map(header => columns[normalize(header)]);
  const seen = new Set<string>();
  headers.forEach((header, index) => {
    if (!fields[index]) throw new BadRequestException(`Columna no reconocida: ${header || index + 1}. Utiliza la plantilla de ejemplo`);
    if (seen.has(fields[index])) throw new BadRequestException(`Columna duplicada: ${header}`);
    seen.add(fields[index]);
  });
  if (!seen.has('name') || !seen.has('acceptanceCriteria')) throw new BadRequestException('Faltan las columnas nombre y criterio_aceptacion');
  const positions = new Set<number>();
  const rows: Array<{ row: number; parentPosition: number | null; data: FatCase; errors: string[] }> = [];
  const explicitPositions = new Set<number>();
  for (let r = 1; r <= range.e.r; r++) {
    const cells = fields.map((_, c) => sheet[XLSX.utils.encode_cell({ r, c })]);
    if (cells.every(cell => !cell?.f && (cell?.v === undefined || String(cell.v).trim() === ''))) continue;
    const errors: string[] = [];
    const values: Record<string, string> = Object.create(null);
    cells.forEach((cell, c) => {
      const value = String(cell?.v ?? '').trim();
      if (cell?.f || value.startsWith('=')) errors.push(`${headers[c]}: no se admiten fórmulas; pega valores`);
      if (cell?.t === 'e') errors.push(`${headers[c]}: la celda contiene un error de Excel`);
      if (value.length > 10000) errors.push(`${headers[c]}: supera 10000 caracteres`);
      values[fields[c]] = value;
    });
    const number = (key: string): number | null => {
      const raw = values[key]; if (!raw) return null;
      const valid = /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(raw);
      const value = Number(raw.replace(',', '.'));
      if (!valid || !Number.isFinite(value) || Math.abs(value) > 1e12) { errors.push(`${key}: número inválido (sin separadores de miles)`); return null; }
      return value;
    };
    const boolean = (key: string, fallback: boolean) => {
      const raw = normalize(values[key]); if (!raw) return fallback;
      if (['si', 'true', '1', 'yes', 'x'].includes(raw)) return true;
      if (['no', 'false', '0'].includes(raw)) return false;
      errors.push(`${key}: usa sí/no o true/false`); return fallback;
    };
    const position = values.position ? number('position') ?? 0 : rows.length + 1;
    if (values.position) explicitPositions.add(r + 1);
    const parentPosition = values.parentPosition ? number('parentPosition') ?? 0 : null;
    if (parentPosition !== null && (!Number.isInteger(parentPosition) || parentPosition < 1 || parentPosition > 2147483647)) errors.push('punto_padre debe ser la posición entera positiva de un punto principal');
    if (!Number.isInteger(position) || position < 1 || position > 2147483647 || positions.has(position)) errors.push('La posición debe ser un entero positivo único');
    positions.add(position);
    const types: Record<string, FatCase['resultType']> = { boolean: 'BOOLEAN', booleano: 'BOOLEAN', conforme: 'BOOLEAN', numeric: 'NUMERIC', numerico: 'NUMERIC', text: 'TEXT', texto: 'TEXT' };
    const typeKey = normalize(values.resultType || 'BOOLEAN');
    const resultType = Object.prototype.hasOwnProperty.call(types, typeKey) ? types[typeKey] : undefined;
    if (!resultType) errors.push('Tipo inválido: usa BOOLEAN, NUMERIC o TEXT');
    const minimumValue = number('minimumValue'); const maximumValue = number('maximumValue');
    if (!values.name) errors.push('El nombre del caso es obligatorio');
    if (!values.acceptanceCriteria) errors.push('El criterio de aceptación es obligatorio');
    if (resultType === 'NUMERIC' && minimumValue === null && maximumValue === null) errors.push('Un caso numérico requiere mínimo o máximo');
    if (minimumValue !== null && maximumValue !== null && minimumValue > maximumValue) errors.push('El mínimo supera al máximo');
    if (resultType !== 'NUMERIC' && (minimumValue !== null || maximumValue !== null)) errors.push('Los límites solo se aplican a casos NUMERIC');
    const data: FatCase = { position, section: values.section || null, name: values.name || '', instructions: values.instructions || null, acceptanceCriteria: values.acceptanceCriteria || '', resultType: resultType || 'BOOLEAN', minimumValue, maximumValue, unit: values.unit || null, required: boolean('required', true), evidenceRequired: boolean('evidenceRequired', false) };
    rows.push({ row: r + 1, parentPosition, data, errors });
  }
  if (!rows.length) throw new BadRequestException('No hay casos de prueba debajo de los encabezados');
  const hierarchical = rows.some(row => row.parentPosition !== null);
  const byPosition = new Map<number, typeof rows>();
  for (const row of rows) byPosition.set(row.data.position, [...(byPosition.get(row.data.position) || []), row]);
  for (const row of rows) {
    if (hierarchical && !explicitPositions.has(row.row)) row.errors.push('La importación jerárquica requiere posicion explícita en todas las filas');
    if (byPosition.get(row.data.position)!.length > 1 && !row.errors.some(e => e.includes('posición'))) row.errors.push('La posición debe ser un entero positivo único');
    if (row.parentPosition === null) continue;
    if (row.parentPosition === row.data.position) { row.errors.push('Un subpunto no puede ser su propio padre'); continue; }
    const parents = byPosition.get(row.parentPosition);
    if (!parents?.length) { row.errors.push(`punto_padre ${row.parentPosition}: no existe en el archivo`); continue; }
    if (parents.length !== 1) { row.errors.push(`punto_padre ${row.parentPosition}: referencia ambigua por posición duplicada`); continue; }
    const parent = parents[0];
    if (parent.parentPosition !== null) { row.errors.push('Solo se permite un nivel: el padre debe ser un punto principal (no un subpunto ni un ciclo)'); continue; }
    if (row.data.section && row.data.section !== parent.data.section) row.errors.push('La sección del subpunto debe estar vacía o coincidir con la de su punto padre');
    if (!row.data.section) row.data.section = parent.data.section;
  }
  const roots = rows.filter(row => row.parentPosition === null).sort((a, b) => a.data.position - b.data.position);
  for (const root of roots) {
    const children = rows.filter(row => row.parentPosition === root.data.position);
    if (children.length > 50) {
      root.errors.push('El punto supera el máximo de 50 subpuntos');
      for (const child of children) child.errors.push('El padre supera el máximo de 50 subpuntos');
    }
    if (root.data.position + (rows.length - roots.length) > 2147483647) root.errors.push('La posición es demasiado alta para asignar los subpuntos en la ejecución');
  }
  const errorRows = rows.filter(row => row.errors.length).length;
  // Never provide a partially importable hierarchy. Row diagnostics remain available.
  const cases: FatCase[] = errorRows ? [] : roots.map(root => {
    const children = rows.filter(row => row.parentPosition === root.data.position).sort((a, b) => a.data.position - b.data.position);
    return { ...root.data, ...(children.length ? { subpoints: children.map(({ data: { position: _position, section: _section, ...definition } }) => definition) } : {}) };
  });
  return { sheetName, rows, cases, hierarchical, rootCount: roots.length, subpointCount: rows.length - roots.length, totalRows: rows.length, errorRows, warnings: workbook.SheetNames.length > 1 ? ['Solo se importa la primera hoja: ' + sheetName] : [] };
}

export function fatProtocolExample(format: string, layout = 'flat') {
  if (!['xlsx', 'csv'].includes(format)) throw new BadRequestException('Formato de ejemplo inválido');
  if (!['flat', 'hierarchical'].includes(layout)) throw new BadRequestException('Estructura de ejemplo inválida');
  const values: any[][] = [
    ['posicion', 'seccion', 'nombre', 'instrucciones', 'criterio_aceptacion', 'tipo', 'minimo', 'maximo', 'unidad', 'obligatorio', 'evidencia_obligatoria'],
    [10, 'Seguridad', 'Parada de emergencia', 'Accionar el pulsador', 'La máquina se detiene', 'BOOLEAN', '', '', '', 'sí', 'sí'],
    [20, 'Eléctrica', 'Tensión de alimentación', 'Medir en la entrada', 'Entre 210 y 230 V', 'NUMERIC', 210, 230, 'V', 'sí', 'sí'],
    [30, 'Automatización', 'Versión del programa', 'Consultar versión en HMI', 'Coincide con ingeniería', 'TEXT', '', '', '', 'sí', 'no'],
  ];
  if (layout === 'hierarchical') {
    values[0].push('punto_padre');
    values.splice(3, 0,
      [21, '', 'Continuidad de tierra', 'Medir continuidad de protección', 'Resistencia menor o igual a 1 ohm', 'NUMERIC', 0, 1, 'ohm', 'sí', 'sí', 20],
      [22, '', 'Identificación de conductores', 'Revisar etiquetas contra plano', 'Todos los conductores identificados', 'BOOLEAN', '', '', '', 'sí', 'no', 20]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(values);
  if (format === 'csv') return Buffer.from('\ufeff' + XLSX.utils.sheet_to_csv(sheet, { FS: ';' }), 'utf8');
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Protocolo FAT');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
