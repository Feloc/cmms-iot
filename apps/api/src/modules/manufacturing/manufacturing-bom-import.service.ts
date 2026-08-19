import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { ManufacturingBomsService } from './manufacturing-boms.service';
import type { ManufacturingBomLineInput } from './dto/manufacturing-bom.dto';

type PreparedUpload = { tenantId: string; userId: string; revisionId: string; expiresAt: number; sha256: string; lines: ManufacturingBomLineInput[]; filename: string };
type PreviewRow = ManufacturingBomLineInput & { _row: number; _errors: string[]; _warnings: string[] };

@Injectable()
export class ManufacturingBomImportService {
  private readonly uploads = new Map<string, PreparedUpload>();
  constructor(private readonly prisma: PrismaService, private readonly boms: ManufacturingBomsService) {}

  async preview(revisionId: string, file: { path: string; originalname: string }) {
    const context = tenantStorage.getStore();
    if (!context?.tenantId || !context?.userId) throw new ForbiddenException('Contexto de usuario incompleto');
    const revision = await this.boms.getRevision(revisionId);
    if (revision.status !== 'DRAFT') throw new ConflictException('Solo un borrador puede recibir una importación');
    const buffer = await fs.promises.readFile(file.path);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const rawRows = this.read(buffer);
    if (!rawRows.length) throw new BadRequestException('El archivo no contiene filas');
    if (rawRows.length > 5000) throw new BadRequestException('El archivo supera 5000 líneas');

    const skuValues = new Set<string>(); const drawingCodes = new Set<string>();
    for (const raw of rawRows) {
      const sku = this.value(raw, ['inventory_sku', 'inventorySku']); if (sku) skuValues.add(sku.toUpperCase());
      const drawing = this.value(raw, ['drawing_code', 'drawingCode']); if (drawing) drawingCodes.add(drawing.toUpperCase());
    }
    const inventory = await (this.prisma as any).inventoryItem.findMany({ where: { tenantId: context.tenantId, sku: { in: [...skuValues], mode: 'insensitive' } }, select: { id: true, sku: true, name: true, uom: true } });
    const documents = await (this.prisma as any).engineeringDocument.findMany({ where: { tenantId: context.tenantId, manufacturingOrderId: revision.bom.manufacturingOrderId, code: { in: [...drawingCodes] } }, include: { revisions: { select: { id: true, revisionCode: true } } } });
    const inventoryBySku = new Map<string, any>(inventory.map((item: any) => [item.sku.toUpperCase(), item]));
    const documentsByCode = new Map<string, any>(documents.map((item: any) => [item.code.toUpperCase(), item]));
    const positions = new Set<number>();
    const rows: PreviewRow[] = rawRows.map((raw, index) => this.normalizeRow(raw, index + 2, positions, inventoryBySku, documentsByCode));
    const errorRows = rows.filter((row) => row._errors.length).length;
    const warningRows = rows.filter((row) => row._warnings.length).length;
    let uploadToken: string | null = null;
    const expiresAt = Date.now() + 30 * 60 * 1000;
    if (!errorRows) {
      uploadToken = randomUUID();
      this.cleanup();
      this.uploads.set(uploadToken, { tenantId: context.tenantId, userId: context.userId, revisionId, expiresAt, sha256, filename: file.originalname, lines: rows.map(({ _row, _errors, _warnings, ...line }) => line) });
    }
    return { uploadToken, sha256, expiresAt: new Date(expiresAt).toISOString(), totalRows: rows.length, errors: errorRows, warnings: warningRows, sample: rows.slice(0, 200) };
  }

  async commit(revisionId: string, uploadToken: string) {
    const context = tenantStorage.getStore();
    if (!context?.tenantId || !context?.userId) throw new ForbiddenException('Contexto de usuario incompleto');
    const token = String(uploadToken || '').trim();
    const upload = this.uploads.get(token);
    if (!upload || upload.expiresAt < Date.now()) { this.uploads.delete(token); throw new BadRequestException('La previsualización expiró o no existe'); }
    if (upload.tenantId !== context.tenantId || upload.userId !== context.userId || upload.revisionId !== revisionId) throw new ForbiddenException('La previsualización no pertenece a este usuario o revisión');
    this.uploads.delete(token);
    return this.boms.replaceLines(revisionId, { lines: upload.lines }, { filename: upload.filename, sha256: upload.sha256, importedLines: upload.lines.length });
  }

  private read(buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: '' }) : [];
  }

  private normalizeRow(raw: Record<string, unknown>, rowNumber: number, positions: Set<number>, inventoryBySku: Map<string, any>, documentsByCode: Map<string, any>): PreviewRow {
    const errors: string[] = []; const warnings: string[] = [];
    const position = Number(this.value(raw, ['position', 'posicion']));
    if (!Number.isInteger(position) || position < 1) errors.push('position debe ser entero positivo');
    else if (positions.has(position)) errors.push('position está duplicada'); else positions.add(position);
    const parentRaw = this.value(raw, ['parent_position', 'parentPosition', 'posicion_padre']);
    const parentPosition = parentRaw ? Number(parentRaw) : null;
    if (parentPosition !== null && (!Number.isInteger(parentPosition) || parentPosition >= position || !positions.has(parentPosition))) errors.push('parent_position debe referir una posición anterior');
    const quantityPerUnit = Number(this.value(raw, ['quantity_per_unit', 'quantityPerUnit', 'cantidad_por_unidad', 'quantity']));
    if (!Number.isFinite(quantityPerUnit) || quantityPerUnit <= 0) errors.push('quantity_per_unit debe ser mayor que cero');
    const sku = this.value(raw, ['inventory_sku', 'inventorySku']).toUpperCase();
    const item = sku ? inventoryBySku.get(sku) : null;
    if (sku && !item) errors.push(`inventory_sku ${sku} no existe`);
    const itemCode = this.value(raw, ['item_code', 'itemCode', 'codigo']) || item?.sku || '';
    const description = this.value(raw, ['description', 'descripcion']) || item?.name || '';
    if (!itemCode) errors.push('item_code es obligatorio');
    if (!description) errors.push('description es obligatoria');
    if (!item) warnings.push('Línea no vinculada a Inventario');
    const supplyType = this.supply(this.value(raw, ['supply_type', 'supplyType', 'abastecimiento']), errors);
    const criticality = this.enumValue(this.value(raw, ['criticality', 'criticidad']) || 'MEDIUM', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], 'criticality', errors) as any;
    const drawingCode = this.value(raw, ['drawing_code', 'drawingCode']).toUpperCase();
    const drawingRevisionCode = this.value(raw, ['drawing_revision', 'drawingRevision']).toUpperCase();
    const document = drawingCode ? documentsByCode.get(drawingCode) : null;
    if (drawingCode && !document) errors.push(`drawing_code ${drawingCode} no pertenece a la orden`);
    const drawingRevision = document && drawingRevisionCode ? document.revisions.find((item: any) => item.revisionCode.toUpperCase() === drawingRevisionCode) : null;
    if (drawingRevisionCode && !drawingRevision) errors.push(`drawing_revision ${drawingRevisionCode} no existe para ${drawingCode || 'el plano'}`);
    const leadRaw = this.value(raw, ['lead_time_days', 'leadTimeDays']);
    const leadTimeDays = leadRaw === '' ? null : Number(leadRaw);
    if (leadTimeDays !== null && (!Number.isInteger(leadTimeDays) || leadTimeDays < 0)) errors.push('lead_time_days debe ser entero no negativo');
    return {
      _row: rowNumber, _errors: errors, _warnings: warnings, position, parentPosition,
      inventoryItemId: item?.id || null, itemCode, description, quantityPerUnit,
      uom: this.value(raw, ['uom', 'unidad']) || item?.uom || 'UND', supplyType,
      isOptional: this.boolean(this.value(raw, ['is_optional', 'isOptional', 'opcional'])), criticality,
      drawingDocumentId: document?.id || null, drawingRevisionId: drawingRevision?.id || null,
      materialSpecification: this.nullable(raw, ['material_specification', 'materialSpecification', 'material']),
      manufacturer: this.nullable(raw, ['manufacturer', 'fabricante']), manufacturerPartNo: this.nullable(raw, ['manufacturer_part_no', 'manufacturerPartNo', 'referencia_fabricante']),
      preferredSupplier: this.nullable(raw, ['preferred_supplier', 'preferredSupplier', 'proveedor']), leadTimeDays,
      notes: this.nullable(raw, ['notes', 'notas']),
    };
  }

  private value(row: Record<string, unknown>, keys: string[]) { for (const key of keys) if (Object.prototype.hasOwnProperty.call(row, key)) return String(row[key] ?? '').trim(); return ''; }
  private nullable(row: Record<string, unknown>, keys: string[]) { return this.value(row, keys) || null; }
  private boolean(value: string) { return ['1', 'TRUE', 'YES', 'SI', 'SÍ', 'X'].includes(value.toUpperCase()); }
  private enumValue(value: string, allowed: string[], field: string, errors: string[]) { const normalized = value.toUpperCase(); if (!allowed.includes(normalized)) { errors.push(`${field} inválido`); return allowed[0]; } return normalized; }
  private supply(value: string, errors: string[]) { const aliases: Record<string, string> = { STOCK: 'STOCK', INVENTARIO: 'STOCK', BUY: 'BUY', COMPRA: 'BUY', MAKE: 'MAKE', FABRICAR: 'MAKE', FABRICACIÓN: 'MAKE', SUBCONTRACT: 'SUBCONTRACT', TERCERO: 'SUBCONTRACT', SUBCONTRATAR: 'SUBCONTRACT' }; const normalized = aliases[value.toUpperCase()]; if (!normalized) { errors.push('supply_type debe ser STOCK, BUY, MAKE o SUBCONTRACT'); return 'BUY' as any; } return normalized as any; }
  private cleanup() { const now = Date.now(); for (const [token, upload] of this.uploads) if (upload.expiresAt < now) this.uploads.delete(token); }
}
