import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import type { CreateManufacturingFatTemplateDto } from './dto/manufacturing-fat.dto';

export const FAT_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const FAT_IMPORT_MAX_CASES = 500;
type FatCase = CreateManufacturingFatTemplateDto['cases'][number];
const normalize = (value: unknown) => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_-]+/g, '');
const columns: Record<string, keyof FatCase> = Object.create(null);
for (const [field, aliases] of Object.entries({
  position: ['posicion', 'orden'], section: ['seccion'], name: ['nombre', 'caso', 'prueba'],
  instructions: ['instrucciones'], acceptanceCriteria: ['criterio', 'criterio_aceptacion', 'criterio_de_aceptacion'],
  resultType: ['tipo', 'tipo_resultado'], minimumValue: ['minimo'], maximumValue: ['maximo'],
  unit: ['unidad'], required: ['obligatorio'], evidenceRequired: ['evidencia', 'evidencia_obligatoria'],
})) for (const alias of [field, ...aliases]) columns[normalize(alias)] = field as keyof FatCase;

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
  const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref']);
  if (range.e.r > FAT_IMPORT_MAX_CASES || range.e.c > 19) throw new BadRequestException('Se permiten hasta 500 casos y 20 columnas, con encabezados en la primera fila');
  const headers = Array.from({ length: range.e.c + 1 }, (_, c) => String(sheet[XLSX.utils.encode_cell({ r: 0, c })]?.v ?? '').trim());
  const fields = headers.map(header => columns[normalize(header)]);
  const seen = new Set<string>();
  headers.forEach((header, index) => {
    if (!fields[index]) throw new BadRequestException(`Columna no reconocida: ${header || index + 1}. Utiliza la plantilla de ejemplo`);
    if (seen.has(fields[index])) throw new BadRequestException(`Columna duplicada: ${header}`);
    seen.add(fields[index]);
  });
  if (!seen.has('name') || !seen.has('acceptanceCriteria')) throw new BadRequestException('Faltan las columnas nombre y criterio_aceptacion');
  const positions = new Set<number>();
  const rows: Array<{ row: number; data: FatCase; errors: string[] }> = [];
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
    rows.push({ row: r + 1, data, errors });
  }
  if (!rows.length) throw new BadRequestException('No hay casos de prueba debajo de los encabezados');
  return { sheetName, rows, totalRows: rows.length, errorRows: rows.filter(row => row.errors.length).length, warnings: workbook.SheetNames.length > 1 ? ['Solo se importa la primera hoja: ' + sheetName] : [] };
}

export function fatProtocolExample(format: string) {
  if (!['xlsx', 'csv'].includes(format)) throw new BadRequestException('Formato de ejemplo inválido');
  const sheet = XLSX.utils.aoa_to_sheet([
    ['posicion', 'seccion', 'nombre', 'instrucciones', 'criterio_aceptacion', 'tipo', 'minimo', 'maximo', 'unidad', 'obligatorio', 'evidencia_obligatoria'],
    [10, 'Seguridad', 'Parada de emergencia', 'Accionar el pulsador', 'La máquina se detiene', 'BOOLEAN', '', '', '', 'sí', 'sí'],
    [20, 'Eléctrica', 'Tensión de alimentación', 'Medir en la entrada', 'Entre 210 y 230 V', 'NUMERIC', 210, 230, 'V', 'sí', 'sí'],
    [30, 'Automatización', 'Versión del programa', 'Consultar versión en HMI', 'Coincide con ingeniería', 'TEXT', '', '', '', 'sí', 'no'],
  ]);
  if (format === 'csv') return Buffer.from('\ufeff' + XLSX.utils.sheet_to_csv(sheet, { FS: ';' }), 'utf8');
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Protocolo FAT');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
