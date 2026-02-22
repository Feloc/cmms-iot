import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { Prisma } from '@prisma/client';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  list(tenantId: string, q?: string) {
    const where: Prisma.InventoryItemWhereInput = { tenantId };
    const s = String(q ?? '').trim();
    if (s) {
      where.OR = [
        { sku: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
      ];
    }
    return this.prisma.inventoryItem.findMany({ where, orderBy: [{ name: 'asc' }, { sku: 'asc' }] });
  }

  search(tenantId: string, q: string) {
    const s = q.trim();
    const where: Prisma.InventoryItemWhereInput = { tenantId };
    if (s) {
      where.OR = [
        { sku: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
        //{ model: { contains: s, mode: 'insensitive' } },
      ];
    }
    return this.prisma.inventoryItem.findMany({ where, take: 25, orderBy: { name: 'asc' } });
  }

  async create(tenantId: string, dto: CreateInventoryItemDto) {
    const sku = String(dto?.sku ?? '').trim();
    const name = String(dto?.name ?? '').trim();
    if (!sku) throw new BadRequestException('sku is required');
    if (!name) throw new BadRequestException('name is required');

    const qtyRaw = dto?.qty ?? 0;
    const qtyNum = Number(qtyRaw);
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      throw new BadRequestException('qty must be a non-negative number');
    }
    const qty = Math.round(qtyNum);

    let unitPrice: number | null = null;
    if (dto?.unitPrice !== undefined && dto?.unitPrice !== null && String(dto.unitPrice).trim() !== '') {
      const p = Number(dto.unitPrice);
      if (!Number.isFinite(p) || p < 0) {
        throw new BadRequestException('unitPrice must be a non-negative number');
      }
      unitPrice = p;
    }

    const exists = await this.prisma.inventoryItem.findFirst({
      where: { tenantId, sku },
      select: { id: true },
    });
    if (exists) throw new ConflictException('SKU already exists');

    return this.prisma.inventoryItem.create({
      data: {
        tenantId,
        sku,
        name,
        qty,
        unitPrice,
      } as any,
    });
  }

  async upsertManyBySku(
    tenantId: string,
    rows: Array<{ sku: string; name: string; qty: number; unitPrice?: number | null }>,
  ) {
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
              data: { name, qty, unitPrice } as any,
            });
            updated += 1;
          } else {
            await tx.inventoryItem.create({
              data: { tenantId, sku, name, qty, unitPrice } as any,
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
}
