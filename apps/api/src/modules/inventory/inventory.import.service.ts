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
  _row: number;
  _errors: string[];
  _warnings: string[];
};

@Injectable()
export class InventoryImportService {
  constructor(private readonly inventoryService: InventoryService) {}

  async preview(filePath: string) {
    const rows = this.parse(filePath);
    return this.summarize(rows, 200);
  }

  async commit(filePath: string) {
    const tenantId = getTenant();
    if (!tenantId) throw new BadRequestException('No tenant in context');

    const rows = this.parse(filePath);
    const valid = rows.filter((r) => r._errors.length === 0);

    const result = await this.inventoryService.upsertManyBySku(
      tenantId,
      valid.map((r) => ({
        sku: r.sku,
        name: r.name,
        qty: r.qty,
        unitPrice: r.unitPrice,
      })),
    );

    const parseIssues = rows
      .filter((r) => r._errors.length > 0)
      .map((r) => ({ row: r._row, sku: r.sku || undefined, error: r._errors.join('; ') }));

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
      sku: String(this.pick(raw, ['sku', 'SKU', 'code', 'codigo']) ?? '').trim(),
      name: String(this.pick(raw, ['name', 'nombre', 'Name']) ?? '').trim(),
      qty: 0,
      unitPrice: null,
      _row: rowNumber,
      _errors: [],
      _warnings: [],
    };

    if (!out.sku) out._errors.push('sku es requerido');
    if (!out.name) out._errors.push('name es requerido');

    const qtyRaw = this.pick(raw, ['qty', 'cantidad', 'stock']);
    const qtyNum = qtyRaw === '' || qtyRaw === null || qtyRaw === undefined ? 0 : Number(qtyRaw);
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      out._errors.push('qty debe ser >= 0');
    } else {
      out.qty = Math.round(qtyNum);
    }

    const priceRaw = this.pick(raw, ['unitPrice', 'price', 'precio', 'cost', 'costo']);
    if (priceRaw !== '' && priceRaw !== null && priceRaw !== undefined) {
      const price = Number(priceRaw);
      if (!Number.isFinite(price) || price < 0) out._errors.push('unitPrice debe ser >= 0');
      else out.unitPrice = price;
    }

    return out;
  }

  private pick(row: Record<string, any>, keys: string[]) {
    const map = new Map<string, any>();
    for (const [k, v] of Object.entries(row || {})) {
      map.set(String(k).trim().toLowerCase(), v);
    }
    for (const key of keys) {
      const value = map.get(String(key).trim().toLowerCase());
      if (value !== undefined) return value;
    }
    return undefined;
  }
}
