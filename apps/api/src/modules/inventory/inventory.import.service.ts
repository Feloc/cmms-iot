import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenant } from '../../common/tenant-context';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { InventoryService } from './inventory.service';

type InventoryImportRow = {
  sku: string;
  name: string;
  qty: number;
  unitPrice: number | null;
  oemPartNo?: string | null;
  supplierPartNo?: string | null;
  description?: string | null;
  partType?: 'PART' | 'ASSEMBLY' | 'KIT' | 'CONSUMABLE';
  uom?: string | null;
  systemGroup?: string | null;
  sectionCode?: string | null;
  sectionName?: string | null;
  itemNo?: string | null;
  parentOemPartNo?: string | null;
  preferredSupplier?: string | null;
  leadTimeDays?: number | null;
  criticality?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status?: 'ACTIVE' | 'OBSOLETE' | 'DISCONTINUED';
  interchangeableWith?: string | null;
  notes?: string | null;
  lastCost?: number | null;
  avgCost?: number | null;
  currency?: string | null;
  equipmentModel?: string | null;
  variant?: string | null;
  serialFrom?: string | null;
  serialTo?: string | null;
  appliedDateFrom?: string | null;
  appliedDateTo?: string | null;
  qtyPerEquipment?: number | null;
  isOptional?: boolean;
  manualRemark?: string | null;
  manualPageRef?: string | null;
  warehouse?: string | null;
  binLocation?: string | null;
  stockReserved?: number | null;
  stockMin?: number | null;
  stockMax?: number | null;
  reorderPoint?: number | null;
  reorderQty?: number | null;
  _row: number;
  _errors: string[];
  _warnings: string[];
};

@Injectable()
export class InventoryImportService {
  constructor(private readonly inventoryService: InventoryService) {}

  async preview(filePath: string) {
    const tenantId = getTenant();
    if (!tenantId) throw new BadRequestException('No tenant in context');
    await this.inventoryService.assertAdmin(tenantId);

    const rows = this.parse(filePath);
    return this.summarize(rows, 200);
  }

  async commit(filePath: string) {
    const tenantId = getTenant();
    if (!tenantId) throw new BadRequestException('No tenant in context');
    await this.inventoryService.assertAdmin(tenantId);

    const rows = this.parse(filePath);
    const valid = rows.filter((r) => r._errors.length === 0);

    const result = await this.inventoryService.upsertManyBySku(
      tenantId,
      valid.map((r) => ({
        sku: r.sku,
        name: r.name,
        qty: r.qty,
        unitPrice: r.unitPrice,
        oemPartNo: r.oemPartNo,
        supplierPartNo: r.supplierPartNo,
        description: r.description,
        partType: r.partType,
        uom: r.uom,
        systemGroup: r.systemGroup,
        sectionCode: r.sectionCode,
        sectionName: r.sectionName,
        itemNo: r.itemNo,
        parentOemPartNo: r.parentOemPartNo,
        preferredSupplier: r.preferredSupplier,
        leadTimeDays: r.leadTimeDays,
        criticality: r.criticality,
        status: r.status,
        interchangeableWith: r.interchangeableWith,
        notes: r.notes,
        lastCost: r.lastCost,
        avgCost: r.avgCost,
        currency: r.currency,
      })),
    );

    const parseIssues = rows
      .filter((r) => r._errors.length > 0)
      .map((r) => ({ row: r._row, sku: r.sku || undefined, error: r._errors.join('; ') }));

    await this.inventoryService.syncApplicabilityBySku(
      tenantId,
      valid.map((r) => ({
        sku: r.sku,
        applicability: [
          {
            equipmentModel: r.equipmentModel,
            variant: r.variant,
            serialFrom: r.serialFrom,
            serialTo: r.serialTo,
            appliedDateFrom: r.appliedDateFrom,
            appliedDateTo: r.appliedDateTo,
            itemNo: r.itemNo,
            qtyPerEquipment: r.qtyPerEquipment,
            isOptional: r.isOptional,
            manualRemark: r.manualRemark,
            manualPageRef: r.manualPageRef,
          },
        ],
      })),
    );

    await this.inventoryService.syncStocksBySku(
      tenantId,
      valid.map((r) => ({
        sku: r.sku,
        stocks: [
          {
            warehouse: r.warehouse,
            binLocation: r.binLocation,
            stockOnHand: r.qty,
            stockReserved: r.stockReserved,
            stockMin: r.stockMin,
            stockMax: r.stockMax,
            reorderPoint: r.reorderPoint,
            reorderQty: r.reorderQty,
          },
        ],
      })),
    );

    return {
      totalRows: rows.length,
      validRows: valid.length,
      created: result.created,
      updated: result.updated,
      failed: result.failed + parseIssues.length,
      issues: [...parseIssues, ...result.issues],
    };
  }

  private summarize(rows: InventoryImportRow[], sampleLimit: number) {
    const sample = rows.slice(0, sampleLimit);
    const errors = rows.reduce((acc, r) => acc + (r._errors.length ? 1 : 0), 0);
    const warnings = rows.reduce((acc, r) => acc + (r._warnings.length ? 1 : 0), 0);
    return {
      totalRows: rows.length,
      errors,
      warnings,
      sample,
    };
  }

  private parse(filePath: string): InventoryImportRow[] {
    const buffer = fs.readFileSync(filePath);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const wsName = wb.SheetNames[0];
    if (!wsName) return [];

    const ws = wb.Sheets[wsName];
    const jsonRows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: '' }) as any[];

    return (jsonRows || []).map((raw, idx) => this.normalizeRow(raw, idx + 2));
  }

  private normalizeRow(raw: Record<string, any>, rowNumber: number): InventoryImportRow {
    const out: InventoryImportRow = {
      sku: String(this.pick(raw, ['sku', 'internal_sku', 'SKU', 'code', 'codigo']) ?? '').trim(),
      name: String(this.pick(raw, ['name', 'nombre', 'Name']) ?? '').trim(),
      qty: 0,
      unitPrice: null,
      _row: rowNumber,
      _errors: [],
      _warnings: [],
    };

    if (!out.sku) out._errors.push('sku es requerido');
    if (!out.name) out._errors.push('name es requerido');

    const qtyRaw = this.pick(raw, ['qty', 'cantidad', 'stock', 'stock_on_hand']);
    const qtyNum = qtyRaw === '' || qtyRaw === null || qtyRaw === undefined ? 0 : Number(qtyRaw);
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      out._errors.push('qty debe ser >= 0');
    } else {
      out.qty = qtyNum;
    }

    const priceRaw = this.pick(raw, ['unitPrice', 'price', 'precio', 'cost', 'costo', 'unit_price']);
    if (priceRaw !== '' && priceRaw !== null && priceRaw !== undefined) {
      const price = Number(priceRaw);
      if (!Number.isFinite(price) || price < 0) out._errors.push('unitPrice debe ser >= 0');
      else out.unitPrice = price;
    }

    out.oemPartNo = this.optionalText(raw, ['oem_part_no', 'oemPartNo']);
    out.supplierPartNo = this.optionalText(raw, ['supplier_part_no', 'supplierPartNo']);
    out.description = this.optionalText(raw, ['description', 'descripcion']);
    out.partType = this.optionalEnum(raw, ['part_type', 'partType'], ['PART', 'ASSEMBLY', 'KIT', 'CONSUMABLE'], 'partType', out);
    out.uom = this.optionalText(raw, ['uom', 'unit', 'unidad']);
    out.systemGroup = this.optionalText(raw, ['system_group', 'systemGroup']);
    out.sectionCode = this.optionalText(raw, ['section_code', 'sectionCode']);
    out.sectionName = this.optionalText(raw, ['section_name', 'sectionName']);
    out.itemNo = this.optionalText(raw, ['item_no', 'itemNo']);
    out.parentOemPartNo = this.optionalText(raw, ['parent_oem_part_no', 'parentOemPartNo']);
    out.preferredSupplier = this.optionalText(raw, ['preferred_supplier', 'preferredSupplier']);
    out.leadTimeDays = this.optionalInteger(raw, ['lead_time_days', 'leadTimeDays'], 'leadTimeDays', out);
    out.criticality = this.optionalEnum(raw, ['criticality', 'criticidad'], ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], 'criticality', out);
    out.status = this.optionalEnum(raw, ['status', 'estado'], ['ACTIVE', 'OBSOLETE', 'DISCONTINUED'], 'status', out);
    out.interchangeableWith = this.optionalText(raw, ['interchangeable_with', 'interchangeableWith']);
    out.notes = this.optionalText(raw, ['notes', 'nota', 'notas']);
    out.lastCost = this.optionalNumber(raw, ['last_cost', 'lastCost'], 'lastCost', out);
    out.avgCost = this.optionalNumber(raw, ['avg_cost', 'avgCost'], 'avgCost', out);
    out.currency = this.optionalText(raw, ['currency', 'moneda']);
    out.equipmentModel = this.optionalText(raw, ['equipment_model', 'equipmentModel']);
    out.variant = this.optionalText(raw, ['variant']);
    out.serialFrom = this.optionalText(raw, ['serial_from', 'serialFrom']);
    out.serialTo = this.optionalText(raw, ['serial_to', 'serialTo']);
    out.appliedDateFrom = this.optionalDateString(raw, ['applied_date_from', 'appliedDateFrom'], 'appliedDateFrom', out);
    out.appliedDateTo = this.optionalDateString(raw, ['applied_date_to', 'appliedDateTo'], 'appliedDateTo', out);
    out.qtyPerEquipment = this.optionalNumber(raw, ['qty_per_equipment', 'qtyPerEquipment'], 'qtyPerEquipment', out);
    out.isOptional = this.optionalBoolean(raw, ['is_optional', 'isOptional']);
    out.manualRemark = this.optionalText(raw, ['manual_remark', 'manualRemark']);
    out.manualPageRef = this.optionalText(raw, ['manual_page_ref', 'manualPageRef']);
    out.warehouse = this.optionalText(raw, ['warehouse', 'bodega']);
    out.binLocation = this.optionalText(raw, ['bin_location', 'binLocation', 'location', 'ubicacion']);
    out.stockReserved = this.optionalNumber(raw, ['stock_reserved', 'reserved_qty'], 'stockReserved', out);
    out.stockMin = this.optionalNumber(raw, ['stock_min', 'min_qty'], 'stockMin', out);
    out.stockMax = this.optionalNumber(raw, ['stock_max', 'max_qty'], 'stockMax', out);
    out.reorderPoint = this.optionalNumber(raw, ['reorder_point'], 'reorderPoint', out);
    out.reorderQty = this.optionalNumber(raw, ['reorder_qty'], 'reorderQty', out);

    return out;
  }

  private optionalText(row: Record<string, any>, keys: string[]) {
    const picked = this.pickWithPresence(row, keys);
    if (!picked.found) return undefined;
    const text = String(picked.value ?? '').trim();
    return text ? text : null;
  }

  private optionalNumber(row: Record<string, any>, keys: string[], field: string, out: InventoryImportRow) {
    const picked = this.pickWithPresence(row, keys);
    if (!picked.found) return undefined;
    if (picked.value === '' || picked.value === null || picked.value === undefined) return null;
    const value = Number(picked.value);
    if (!Number.isFinite(value) || value < 0) {
      out._errors.push(`${field} debe ser >= 0`);
      return undefined;
    }
    return value;
  }

  private optionalInteger(row: Record<string, any>, keys: string[], field: string, out: InventoryImportRow) {
    const value = this.optionalNumber(row, keys, field, out);
    if (value === undefined || value === null) return value;
    return Math.round(value);
  }

  private optionalEnum<T extends string>(
    row: Record<string, any>,
    keys: string[],
    allowed: readonly T[],
    field: string,
    out: InventoryImportRow,
  ) {
    const picked = this.pickWithPresence(row, keys);
    if (!picked.found) return undefined;
    const raw = String(picked.value ?? '').trim();
    if (!raw) return undefined;
    const normalized = raw.toUpperCase() as T;
    if (!allowed.includes(normalized)) {
      out._errors.push(`${field} debe ser uno de: ${allowed.join(', ')}`);
      return undefined;
    }
    return normalized;
  }

  private optionalDateString(row: Record<string, any>, keys: string[], field: string, out: InventoryImportRow) {
    const picked = this.pickWithPresence(row, keys);
    if (!picked.found) return undefined;
    if (picked.value === '' || picked.value === null || picked.value === undefined) return null;

    const value = String(picked.value).trim();
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      out._errors.push(`${field} debe ser una fecha valida`);
      return undefined;
    }
    return date.toISOString();
  }

  private optionalBoolean(row: Record<string, any>, keys: string[]) {
    const picked = this.pickWithPresence(row, keys);
    if (!picked.found) return undefined;
    const normalized = String(picked.value ?? '').trim().toLowerCase();
    if (!normalized) return false;
    return ['1', 'true', 'yes', 'si', 'sí', 'y'].includes(normalized);
  }

  private pick(row: Record<string, any>, keys: string[]) {
    return this.pickWithPresence(row, keys).value;
  }

  private pickWithPresence(row: Record<string, any>, keys: string[]) {
    const map = new Map<string, any>();
    for (const [k, v] of Object.entries(row || {})) {
      map.set(String(k).trim().toLowerCase(), v);
    }
    for (const key of keys) {
      const normalized = String(key).trim().toLowerCase();
      if (map.has(normalized)) {
        return { found: true, value: map.get(normalized) };
      }
    }
    return { found: false, value: undefined };
  }

}
