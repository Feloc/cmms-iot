import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { Prisma } from '@prisma/client';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { tenantStorage } from '../../common/tenant-context';

type PartTypeValue = 'PART' | 'ASSEMBLY' | 'KIT' | 'CONSUMABLE';
type PartStatusValue = 'ACTIVE' | 'OBSOLETE' | 'DISCONTINUED';
type PartCriticalityValue = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type InventoryUpsertRow = {
  sku: string;
  name: string;
  qty: number;
  unitPrice?: number | null;
  oemPartNo?: string | null;
  supplierPartNo?: string | null;
  description?: string | null;
  partType?: PartTypeValue;
  uom?: string | null;
  systemGroup?: string | null;
  sectionCode?: string | null;
  sectionName?: string | null;
  itemNo?: string | null;
  parentOemPartNo?: string | null;
  preferredSupplier?: string | null;
  leadTimeDays?: number | null;
  criticality?: PartCriticalityValue;
  status?: PartStatusValue;
  interchangeableWith?: string | null;
  notes?: string | null;
  lastCost?: number | null;
  avgCost?: number | null;
  currency?: string | null;
};

type InventoryApplicabilityInput = {
  equipmentModel?: string | null;
  variant?: string | null;
  serialFrom?: string | null;
  serialTo?: string | null;
  appliedDateFrom?: string | Date | null;
  appliedDateTo?: string | Date | null;
  itemNo?: string | null;
  qtyPerEquipment?: number | null;
  isOptional?: boolean | string | number | null;
  manualRemark?: string | null;
  manualPageRef?: string | null;
};

type InventoryApplicabilityRow = {
  equipmentModel?: string | null;
  variant?: string | null;
  serialFrom?: string | null;
  serialTo?: string | null;
  appliedDateFrom?: Date | null;
  appliedDateTo?: Date | null;
  itemNo?: string | null;
  qtyPerEquipment?: number | null;
  isOptional: boolean;
  manualRemark?: string | null;
  manualPageRef?: string | null;
};

type InventoryStockInput = {
  warehouse?: string | null;
  binLocation?: string | null;
  stockOnHand?: number | null;
  stockReserved?: number | null;
  stockMin?: number | null;
  stockMax?: number | null;
  reorderPoint?: number | null;
  reorderQty?: number | null;
};

type InventoryStockRow = {
  warehouse?: string | null;
  binLocation?: string | null;
  stockOnHand: number;
  stockReserved?: number | null;
  stockMin?: number | null;
  stockMax?: number | null;
  reorderPoint?: number | null;
  reorderQty?: number | null;
};

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  private readonly PART_TYPES = ['PART', 'ASSEMBLY', 'KIT', 'CONSUMABLE'] as const;
  private readonly PART_STATUSES = ['ACTIVE', 'OBSOLETE', 'DISCONTINUED'] as const;
  private readonly PART_CRITICALITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

  private normalizeText(value: unknown, field: string, required = false) {
    if (value === undefined) {
      if (required) throw new BadRequestException(`${field} is required`);
      return undefined;
    }
    if (value === null) {
      if (required) throw new BadRequestException(`${field} is required`);
      return null;
    }
    const text = String(value).trim();
    if (!text) {
      if (required) throw new BadRequestException(`${field} is required`);
      return null;
    }
    return text;
  }

  private normalizePositiveInt(value: unknown, field: string) {
    if (value === undefined) return undefined;
    if (value === null || String(value).trim() === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      throw new BadRequestException(`${field} must be a non-negative number`);
    }
    return Math.round(num);
  }

  private normalizeMoney(value: unknown, field: string) {
    if (value === undefined) return undefined;
    if (value === null || String(value).trim() === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      throw new BadRequestException(`${field} must be a non-negative number`);
    }
    return num;
  }

  private normalizePartType(value: unknown) {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const normalized = String(value).trim().toUpperCase();
    if (!this.PART_TYPES.includes(normalized as PartTypeValue)) {
      throw new BadRequestException(`partType must be one of ${this.PART_TYPES.join(', ')}`);
    }
    return normalized as PartTypeValue;
  }

  private normalizePartStatus(value: unknown) {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const normalized = String(value).trim().toUpperCase();
    if (!this.PART_STATUSES.includes(normalized as PartStatusValue)) {
      throw new BadRequestException(`status must be one of ${this.PART_STATUSES.join(', ')}`);
    }
    return normalized as PartStatusValue;
  }

  private normalizePartCriticality(value: unknown) {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const normalized = String(value).trim().toUpperCase();
    if (!this.PART_CRITICALITIES.includes(normalized as PartCriticalityValue)) {
      throw new BadRequestException(`criticality must be one of ${this.PART_CRITICALITIES.join(', ')}`);
    }
    return normalized as PartCriticalityValue;
  }

  private normalizeDate(value: unknown, field: string) {
    if (value === undefined) return undefined;
    if (value === null || String(value).trim() === '') return null;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return date;
  }

  private normalizeNonNegativeFloat(value: unknown, field: string) {
    if (value === undefined) return undefined;
    if (value === null || String(value).trim() === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      throw new BadRequestException(`${field} must be a non-negative number`);
    }
    return num;
  }

  private truthy(value: unknown) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value ?? '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'si', 'sí', 'y'].includes(normalized);
  }

  private sanitizeApplicabilityRows(raw: unknown): InventoryApplicabilityRow[] {
    if (!Array.isArray(raw)) return [];

    return raw
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const row = entry as InventoryApplicabilityInput;
        const normalized = {
          equipmentModel: this.normalizeText(row.equipmentModel, 'equipmentModel'),
          variant: this.normalizeText(row.variant, 'variant'),
          serialFrom: this.normalizeText(row.serialFrom, 'serialFrom'),
          serialTo: this.normalizeText(row.serialTo, 'serialTo'),
          appliedDateFrom: this.normalizeDate(row.appliedDateFrom, 'appliedDateFrom'),
          appliedDateTo: this.normalizeDate(row.appliedDateTo, 'appliedDateTo'),
          itemNo: this.normalizeText(row.itemNo, 'itemNo'),
          qtyPerEquipment: this.normalizeNonNegativeFloat(row.qtyPerEquipment, 'qtyPerEquipment'),
          isOptional: this.truthy(row.isOptional),
          manualRemark: this.normalizeText(row.manualRemark, 'manualRemark'),
          manualPageRef: this.normalizeText(row.manualPageRef, 'manualPageRef'),
        };

        const hasMeaningfulData =
          !!normalized.equipmentModel ||
          !!normalized.variant ||
          !!normalized.serialFrom ||
          !!normalized.serialTo ||
          !!normalized.appliedDateFrom ||
          !!normalized.appliedDateTo ||
          !!normalized.itemNo ||
          (normalized.qtyPerEquipment !== null && normalized.qtyPerEquipment !== undefined) ||
          normalized.isOptional ||
          !!normalized.manualRemark ||
          !!normalized.manualPageRef;

        return hasMeaningfulData ? normalized : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }

  private sanitizeStockRows(raw: unknown): InventoryStockRow[] {
    if (!Array.isArray(raw)) return [];

    return raw
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const row = entry as InventoryStockInput;
        const stockOnHand = this.normalizeNonNegativeFloat(row.stockOnHand, 'stockOnHand');
        const stockReserved = this.normalizeNonNegativeFloat(row.stockReserved, 'stockReserved');
        const stockMin = this.normalizeNonNegativeFloat(row.stockMin, 'stockMin');
        const stockMax = this.normalizeNonNegativeFloat(row.stockMax, 'stockMax');
        const reorderPoint = this.normalizeNonNegativeFloat(row.reorderPoint, 'reorderPoint');
        const reorderQty = this.normalizeNonNegativeFloat(row.reorderQty, 'reorderQty');

        const normalized = {
          warehouse: this.normalizeText(row.warehouse, 'warehouse'),
          binLocation: this.normalizeText(row.binLocation, 'binLocation'),
          stockOnHand: stockOnHand ?? 0,
          stockReserved,
          stockMin,
          stockMax,
          reorderPoint,
          reorderQty,
        };

        const hasMeaningfulData =
          !!normalized.warehouse ||
          !!normalized.binLocation ||
          normalized.stockOnHand > 0 ||
          (normalized.stockReserved !== null && normalized.stockReserved !== undefined) ||
          (normalized.stockMin !== null && normalized.stockMin !== undefined) ||
          (normalized.stockMax !== null && normalized.stockMax !== undefined) ||
          (normalized.reorderPoint !== null && normalized.reorderPoint !== undefined) ||
          (normalized.reorderQty !== null && normalized.reorderQty !== undefined);

        return hasMeaningfulData ? normalized : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }

  private buildStockLocationKey(row: Pick<InventoryStockRow, 'warehouse' | 'binLocation'>) {
    return `${row.warehouse ?? ''}::${row.binLocation ?? ''}`;
  }

  private toLegacyQtyFromStock(rows: InventoryStockRow[]) {
    const total = rows.reduce((sum, row) => sum + (row.stockOnHand ?? 0), 0);
    return Math.max(0, Math.round(total));
  }

  private buildInventoryItemData(input: Omit<InventoryUpsertRow, 'sku' | 'name' | 'qty'> & { name?: string; qty?: number }) {
    return {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.qty !== undefined ? { qty: input.qty } : {}),
      ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
      ...(input.oemPartNo !== undefined ? { oemPartNo: input.oemPartNo } : {}),
      ...(input.supplierPartNo !== undefined ? { supplierPartNo: input.supplierPartNo } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.partType !== undefined ? { partType: input.partType } : {}),
      ...(input.uom !== undefined && input.uom !== null ? { uom: input.uom } : {}),
      ...(input.systemGroup !== undefined ? { systemGroup: input.systemGroup } : {}),
      ...(input.sectionCode !== undefined ? { sectionCode: input.sectionCode } : {}),
      ...(input.sectionName !== undefined ? { sectionName: input.sectionName } : {}),
      ...(input.itemNo !== undefined ? { itemNo: input.itemNo } : {}),
      ...(input.parentOemPartNo !== undefined ? { parentOemPartNo: input.parentOemPartNo } : {}),
      ...(input.preferredSupplier !== undefined ? { preferredSupplier: input.preferredSupplier } : {}),
      ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
      ...(input.criticality !== undefined ? { criticality: input.criticality } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.interchangeableWith !== undefined ? { interchangeableWith: input.interchangeableWith } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.lastCost !== undefined ? { lastCost: input.lastCost } : {}),
      ...(input.avgCost !== undefined ? { avgCost: input.avgCost } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
    };
  }

  async assertAdmin(tenantId: string) {
    const userId = tenantStorage.getStore()?.userId;
    if (!userId) throw new ForbiddenException('Admin only');
    const u = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { role: true },
    });
    if (!u || u.role !== 'ADMIN') throw new ForbiddenException('Admin only');
  }

  async assertAdminOrTech(tenantId: string) {
    const userId = tenantStorage.getStore()?.userId;
    if (!userId) throw new ForbiddenException('Admin or tech only');
    const u = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { role: true },
    });
    if (!u || (u.role !== 'ADMIN' && u.role !== 'TECH')) {
      throw new ForbiddenException('Admin or tech only');
    }
  }

  async list(tenantId: string, q?: string) {
    await this.assertAdmin(tenantId);
    const where: Prisma.InventoryItemWhereInput = { tenantId };
    const s = String(q ?? '').trim();
    if (s) {
      where.OR = [
        { sku: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
        { oemPartNo: { contains: s, mode: 'insensitive' } },
        { supplierPartNo: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { systemGroup: { contains: s, mode: 'insensitive' } },
        { sectionCode: { contains: s, mode: 'insensitive' } },
        { sectionName: { contains: s, mode: 'insensitive' } },
      ];
    }
    return this.prisma.inventoryItem.findMany({
      where,
      orderBy: [{ name: 'asc' }, { sku: 'asc' }],
      include: {
        applicability: {
          orderBy: [{ equipmentModel: 'asc' }, { variant: 'asc' }, { itemNo: 'asc' }],
        },
        stocks: {
          orderBy: [{ warehouse: 'asc' }, { binLocation: 'asc' }],
        },
      },
    });
  }

  async search(tenantId: string, q: string) {
    await this.assertAdminOrTech(tenantId);
    const s = q.trim();
    const where: Prisma.InventoryItemWhereInput = { tenantId };
    if (s) {
      where.OR = [
        { sku: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
        { oemPartNo: { contains: s, mode: 'insensitive' } },
        { supplierPartNo: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { systemGroup: { contains: s, mode: 'insensitive' } },
      ];
    }
    return this.prisma.inventoryItem.findMany({ where, take: 25, orderBy: { name: 'asc' } });
  }

  async create(tenantId: string, dto: CreateInventoryItemDto) {
    await this.assertAdmin(tenantId);
    const sku = String(this.normalizeText(dto?.sku, 'sku', true));
    const name = String(this.normalizeText(dto?.name, 'name', true));
    const qty = this.normalizePositiveInt(dto?.qty ?? 0, 'qty');
    const unitPrice = this.normalizeMoney(dto?.unitPrice, 'unitPrice');
    const lastCost = this.normalizeMoney(dto?.lastCost, 'lastCost');
    const avgCost = this.normalizeMoney(dto?.avgCost, 'avgCost');
    const leadTimeDays = this.normalizePositiveInt(dto?.leadTimeDays, 'leadTimeDays');

    if (qty === undefined || qty === null) {
      throw new BadRequestException('qty must be a non-negative number');
    }

    const exists = await this.prisma.inventoryItem.findFirst({
      where: { tenantId, sku },
      select: { id: true },
    });
    if (exists) throw new ConflictException('SKU already exists');

    const applicability = this.sanitizeApplicabilityRows((dto as any)?.applicability);
    const stocks = this.sanitizeStockRows((dto as any)?.stocks);
    const legacyQty = stocks.length > 0 ? this.toLegacyQtyFromStock(stocks) : qty;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({
        data: {
          tenantId,
          sku,
          ...this.buildInventoryItemData({
            name,
            qty: legacyQty,
            unitPrice,
            oemPartNo: this.normalizeText(dto?.oemPartNo, 'oemPartNo'),
            supplierPartNo: this.normalizeText(dto?.supplierPartNo, 'supplierPartNo'),
            description: this.normalizeText(dto?.description, 'description'),
            partType: this.normalizePartType(dto?.partType),
            uom: this.normalizeText(dto?.uom, 'uom'),
            systemGroup: this.normalizeText(dto?.systemGroup, 'systemGroup'),
            sectionCode: this.normalizeText(dto?.sectionCode, 'sectionCode'),
            sectionName: this.normalizeText(dto?.sectionName, 'sectionName'),
            itemNo: this.normalizeText(dto?.itemNo, 'itemNo'),
            parentOemPartNo: this.normalizeText(dto?.parentOemPartNo, 'parentOemPartNo'),
            preferredSupplier: this.normalizeText(dto?.preferredSupplier, 'preferredSupplier'),
            leadTimeDays,
            criticality: this.normalizePartCriticality(dto?.criticality),
            status: this.normalizePartStatus(dto?.status),
            interchangeableWith: this.normalizeText(dto?.interchangeableWith, 'interchangeableWith'),
            notes: this.normalizeText(dto?.notes, 'notes'),
            lastCost,
            avgCost,
            currency: this.normalizeText(dto?.currency, 'currency'),
          }),
        } as any,
      });

      if (applicability.length > 0) {
        await tx.inventoryItemApplicability.createMany({
          data: applicability.map((row) => ({
            tenantId,
            inventoryItemId: created.id,
            ...row,
          })) as any,
        });
      }

      if (stocks.length > 0) {
        await tx.inventoryStock.createMany({
          data: stocks.map((row) => ({
            tenantId,
            inventoryItemId: created.id,
            ...row,
          })) as any,
        });
      }

      return tx.inventoryItem.findFirst({
        where: { id: created.id, tenantId },
        include: {
          applicability: {
            orderBy: [{ equipmentModel: 'asc' }, { variant: 'asc' }, { itemNo: 'asc' }],
          },
          stocks: {
            orderBy: [{ warehouse: 'asc' }, { binLocation: 'asc' }],
          },
        },
      });
    });
  }

  async upsertManyBySku(
    tenantId: string,
    rows: InventoryUpsertRow[],
  ) {
    await this.assertAdmin(tenantId);
    let created = 0;
    let updated = 0;
    const issues: Array<{ row: number; sku?: string; error: string }> = [];

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < rows.length; i += 1) {
        const r = rows[i];
        const rowNo = i + 2; // asume encabezado en fila 1
        try {
          const sku = String(r.sku || '').trim();
          const name = String(r.name || '').trim();
          if (!sku || !name) {
            issues.push({ row: rowNo, sku: sku || undefined, error: 'sku and name are required' });
            continue;
          }

          const qtyNum = Number(r.qty ?? 0);
          if (!Number.isFinite(qtyNum) || qtyNum < 0) {
            issues.push({ row: rowNo, sku, error: 'qty must be >= 0' });
            continue;
          }
          const qty = Math.round(qtyNum);

          let unitPrice: number | null = null;
          if (r.unitPrice !== undefined && r.unitPrice !== null && String(r.unitPrice).trim() !== '') {
            const p = Number(r.unitPrice);
            if (!Number.isFinite(p) || p < 0) {
              issues.push({ row: rowNo, sku, error: 'unitPrice must be >= 0' });
              continue;
            }
            unitPrice = p;
          }

          const existing = await tx.inventoryItem.findFirst({
            where: { tenantId, sku },
            select: { id: true },
          });
          if (existing) {
            await tx.inventoryItem.update({
              where: { id: existing.id },
              data: this.buildInventoryItemData({
                name,
                qty,
                unitPrice,
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
              }) as any,
            });
            updated += 1;
          } else {
            await tx.inventoryItem.create({
              data: {
                tenantId,
                sku,
                ...this.buildInventoryItemData({
                  name,
                  qty,
                  unitPrice,
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
                }),
              } as any,
            });
            created += 1;
          }
        } catch (e: any) {
          issues.push({ row: rowNo, sku: r?.sku, error: e?.message || 'unknown error' });
        }
      }
    });

    return { created, updated, failed: issues.length, issues };
  }

  async syncApplicabilityBySku(
    tenantId: string,
    rows: Array<{ sku: string; applicability: InventoryApplicabilityInput[] }>,
  ) {
    const merged = new Map<string, InventoryApplicabilityRow[]>();

    for (const row of rows) {
      const sku = String(row?.sku || '').trim();
      if (!sku) continue;
      const applicability = this.sanitizeApplicabilityRows(row?.applicability);
      if (applicability.length === 0) continue;
      const current = merged.get(sku) ?? [];
      current.push(...applicability);
      merged.set(sku, current);
    }

    const skus = Array.from(merged.keys());
    if (skus.length === 0) return { syncedSkus: 0, applicabilityRows: 0 };

    const items = await this.prisma.inventoryItem.findMany({
      where: { tenantId, sku: { in: skus } },
      select: { id: true, sku: true },
    });
    const itemBySku = new Map(items.map((item) => [item.sku, item]));
    const itemIds = items.map((item) => item.id);

    const createRows = skus.flatMap((sku) => {
      const item = itemBySku.get(sku);
      if (!item) return [];
      return (merged.get(sku) ?? []).map((row) => ({
        tenantId,
        inventoryItemId: item.id,
        ...row,
      }));
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItemApplicability.deleteMany({
        where: {
          tenantId,
          inventoryItemId: { in: itemIds },
        },
      });

      if (createRows.length > 0) {
        await tx.inventoryItemApplicability.createMany({
          data: createRows as any,
        });
      }
    });

    return { syncedSkus: itemIds.length, applicabilityRows: createRows.length };
  }

  async syncStocksBySku(
    tenantId: string,
    rows: Array<{ sku: string; stocks: InventoryStockInput[] }>,
  ) {
    const merged = new Map<string, Map<string, InventoryStockRow>>();

    for (const row of rows) {
      const sku = String(row?.sku || '').trim();
      if (!sku) continue;
      const stocks = this.sanitizeStockRows(row?.stocks);
      if (stocks.length === 0) continue;

      const current = merged.get(sku) ?? new Map<string, InventoryStockRow>();
      for (const stock of stocks) {
        current.set(this.buildStockLocationKey(stock), stock);
      }
      merged.set(sku, current);
    }

    const skus = Array.from(merged.keys());
    if (skus.length === 0) return { syncedSkus: 0, stockRows: 0 };

    const items = await this.prisma.inventoryItem.findMany({
      where: { tenantId, sku: { in: skus } },
      select: { id: true, sku: true },
    });
    const itemBySku = new Map(items.map((item) => [item.sku, item]));
    const itemIds = items.map((item) => item.id);

    const createRows = skus.flatMap((sku) => {
      const item = itemBySku.get(sku);
      if (!item) return [];
      return Array.from(merged.get(sku)?.values() ?? []).map((row) => ({
        tenantId,
        inventoryItemId: item.id,
        ...row,
      }));
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryStock.deleteMany({
        where: {
          tenantId,
          inventoryItemId: { in: itemIds },
        },
      });

      if (createRows.length > 0) {
        await tx.inventoryStock.createMany({
          data: createRows as any,
        });
      }

      for (const sku of skus) {
        const item = itemBySku.get(sku);
        if (!item) continue;
        const stocks = Array.from(merged.get(sku)?.values() ?? []);
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { qty: this.toLegacyQtyFromStock(stocks) },
        });
      }
    });

    return { syncedSkus: itemIds.length, stockRows: createRows.length };
  }
}
