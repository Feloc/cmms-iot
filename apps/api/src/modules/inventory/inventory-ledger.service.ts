import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

type InventoryMovementSourceValue =
  | 'MANUAL'
  | 'IMPORT'
  | 'WORK_ORDER'
  | 'SERVICE_ORDER'
  | 'ADJUSTMENT'
  | 'SYSTEM';

type InventoryMovementTypeValue =
  | 'ENTRY'
  | 'EXIT'
  | 'ADJUSTMENT'
  | 'RESERVATION'
  | 'RELEASE'
  | 'CONSUMPTION'
  | 'RETURN'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT';

type LedgerStockRow = {
  id: string;
  warehouse?: string | null;
  binLocation?: string | null;
  stockOnHand: number;
};

type LedgerItem = {
  id: string;
  tenantId: string;
  qty: number;
  sku: string;
  name: string;
  stocks: LedgerStockRow[];
};

type StockBreakdownInput = {
  inventoryStockId?: string | null;
  warehouse?: string | null;
  binLocation?: string | null;
  qty: number;
};

type ApplyInventoryDeltaInput = {
  tenantId: string;
  inventoryItemId: string;
  qty: number;
  movementType: InventoryMovementTypeValue;
  source: InventoryMovementSourceValue;
  deltaSign: 1 | -1;
  referenceType?: string | null;
  referenceId?: string | null;
  referenceLabel?: string | null;
  note?: string | null;
  unitCost?: number | null;
  createdByUserId?: string | null;
  preferredStockBreakdown?: StockBreakdownInput[];
};

@Injectable()
export class InventoryLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async listMovements(
    tenantId: string,
    params?: { inventoryItemId?: string; limit?: number; q?: string },
  ) {
    const where: Prisma.InventoryMovementWhereInput = { tenantId };
    const inventoryItemId = String(params?.inventoryItemId || '').trim();
    if (inventoryItemId) where.inventoryItemId = inventoryItemId;

    const q = String(params?.q || '').trim();
    if (q) {
      where.OR = [
        { referenceLabel: { contains: q, mode: 'insensitive' } },
        { referenceType: { contains: q, mode: 'insensitive' } },
        { referenceId: { contains: q, mode: 'insensitive' } },
        { note: { contains: q, mode: 'insensitive' } },
        { warehouse: { contains: q, mode: 'insensitive' } },
        { binLocation: { contains: q, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(Math.max(Number(params?.limit ?? 25) || 25, 1), 100);

    return this.prisma.inventoryMovement.findMany({
      where,
      take,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        inventoryItem: {
          select: {
            id: true,
            sku: true,
            name: true,
            uom: true,
            currency: true,
          },
        },
      },
    });
  }

  async consumeInventory(tx: Prisma.TransactionClient, input: Omit<ApplyInventoryDeltaInput, 'deltaSign' | 'movementType'>) {
    return this.applyInventoryDelta(tx, {
      ...input,
      deltaSign: -1,
      movementType: 'CONSUMPTION',
    });
  }

  async returnInventory(
    tx: Prisma.TransactionClient,
    input: Omit<ApplyInventoryDeltaInput, 'deltaSign' | 'movementType'>,
  ) {
    return this.applyInventoryDelta(tx, {
      ...input,
      deltaSign: 1,
      movementType: 'RETURN',
    });
  }

  async reverseOutstandingForReference(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      referenceType: string;
      referenceId: string;
      referenceLabel?: string | null;
      source: InventoryMovementSourceValue;
      note?: string | null;
      createdByUserId?: string | null;
    },
  ) {
    const movements = await tx.inventoryMovement.findMany({
      where: {
        tenantId: input.tenantId,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        inventoryItemId: true,
        inventoryStockId: true,
        warehouse: true,
        binLocation: true,
        stockDelta: true,
        unitCost: true,
      },
    });

    if (movements.length === 0) return { reversedItems: 0, movementCount: 0 };

    const byItem = new Map<
      string,
      {
        unitCost: number | null;
        rows: Map<string, StockBreakdownInput>;
      }
    >();

    for (const movement of movements) {
      const current = byItem.get(movement.inventoryItemId) ?? {
        unitCost: movement.unitCost ?? null,
        rows: new Map<string, StockBreakdownInput>(),
      };
      if (current.unitCost === null && movement.unitCost !== null && movement.unitCost !== undefined) {
        current.unitCost = movement.unitCost;
      }

      const key = `${movement.inventoryStockId ?? ''}::${movement.warehouse ?? ''}::${movement.binLocation ?? ''}`;
      const existing = current.rows.get(key) ?? {
        inventoryStockId: movement.inventoryStockId,
        warehouse: movement.warehouse,
        binLocation: movement.binLocation,
        qty: 0,
      };
      existing.qty += Number(movement.stockDelta ?? 0);
      current.rows.set(key, existing);
      byItem.set(movement.inventoryItemId, current);
    }

    let movementCount = 0;
    for (const [inventoryItemId, item] of byItem.entries()) {
      const preferredStockBreakdown = Array.from(item.rows.values())
        .filter((row) => Number(row.qty) < 0)
        .map((row) => ({
          inventoryStockId: row.inventoryStockId,
          warehouse: row.warehouse,
          binLocation: row.binLocation,
          qty: Math.abs(Number(row.qty)),
        }))
        .filter((row) => row.qty > 0);

      const totalQty = preferredStockBreakdown.reduce((sum, row) => sum + row.qty, 0);
      if (totalQty <= 0) continue;

      const result = await this.returnInventory(tx, {
        tenantId: input.tenantId,
        inventoryItemId,
        qty: totalQty,
        source: input.source,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        referenceLabel: input.referenceLabel,
        note: input.note,
        unitCost: item.unitCost,
        createdByUserId: input.createdByUserId,
        preferredStockBreakdown,
      });
      movementCount += result.movementCount;
    }

    return { reversedItems: byItem.size, movementCount };
  }

  private async applyInventoryDelta(tx: Prisma.TransactionClient, input: ApplyInventoryDeltaInput) {
    const qty = Number(input.qty ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new BadRequestException('qty must be a positive number');
    }

    const item = await this.getItemWithStocks(tx, input.tenantId, input.inventoryItemId);
    const stocks = await this.ensureTrackedStocks(tx, item);
    const allocations =
      input.preferredStockBreakdown && input.preferredStockBreakdown.length > 0
        ? await this.allocateByPreferredBreakdown(tx, item.tenantId, item.id, stocks, qty, input.preferredStockBreakdown)
        : this.allocateAutomatically(stocks, qty, input.deltaSign);

    if (allocations.length === 0) {
      throw new BadRequestException('No stock locations available for inventory movement');
    }

    const stockMap = new Map(stocks.map((stock) => [stock.id, { ...stock }]));
    for (const allocation of allocations) {
      const current = stockMap.get(allocation.stockId);
      if (!current) continue;
      current.stockOnHand += input.deltaSign * allocation.qty;
      await tx.inventoryStock.update({
        where: { id: allocation.stockId },
        data: { stockOnHand: current.stockOnHand },
      });
    }

    const finalTotal = Array.from(stockMap.values()).reduce((sum, stock) => sum + Number(stock.stockOnHand ?? 0), 0);
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { qty: Math.round(finalTotal) },
    });

    if (allocations.length > 0) {
      await tx.inventoryMovement.createMany({
        data: allocations.map((allocation) => ({
          tenantId: input.tenantId,
          inventoryItemId: item.id,
          inventoryStockId: allocation.stockId,
          movementType: input.movementType,
          source: input.source,
          qty: allocation.qty,
          stockDelta: input.deltaSign * allocation.qty,
          balanceAfter: finalTotal,
          warehouse: allocation.warehouse,
          binLocation: allocation.binLocation,
          unitCost: input.unitCost ?? undefined,
          referenceType: input.referenceType ?? undefined,
          referenceId: input.referenceId ?? undefined,
          referenceLabel: input.referenceLabel ?? undefined,
          note: input.note ?? undefined,
          createdByUserId: input.createdByUserId ?? undefined,
        })) as any,
      });
    }

    return {
      movementCount: allocations.length,
      qty,
      balanceAfter: finalTotal,
    };
  }

  private async getItemWithStocks(tx: Prisma.TransactionClient, tenantId: string, inventoryItemId: string): Promise<LedgerItem> {
    const item = await tx.inventoryItem.findFirst({
      where: { id: inventoryItemId, tenantId },
      select: {
        id: true,
        tenantId: true,
        qty: true,
        sku: true,
        name: true,
        stocks: {
          select: {
            id: true,
            warehouse: true,
            binLocation: true,
            stockOnHand: true,
          },
          orderBy: [{ warehouse: 'asc' }, { binLocation: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!item) throw new NotFoundException('Inventory item not found');
    return item as LedgerItem;
  }

  private async ensureTrackedStocks(tx: Prisma.TransactionClient, item: LedgerItem): Promise<LedgerStockRow[]> {
    if (item.stocks.length > 0) return item.stocks;

    const created = await tx.inventoryStock.create({
      data: {
        tenantId: item.tenantId,
        inventoryItemId: item.id,
        stockOnHand: Number(item.qty ?? 0),
      },
      select: {
        id: true,
        warehouse: true,
        binLocation: true,
        stockOnHand: true,
      },
    });

    return [created];
  }

  private allocateAutomatically(stocks: LedgerStockRow[], qty: number, deltaSign: 1 | -1) {
    if (deltaSign > 0) {
      const target = stocks[0];
      return target
        ? [
            {
              stockId: target.id,
              warehouse: target.warehouse,
              binLocation: target.binLocation,
              qty,
            },
          ]
        : [];
    }

    const allocations: Array<{ stockId: string; warehouse?: string | null; binLocation?: string | null; qty: number }> = [];
    let remaining = qty;

    for (const stock of stocks) {
      const available = Math.max(Number(stock.stockOnHand ?? 0), 0);
      if (available <= 0 || remaining <= 0) continue;
      const consumed = Math.min(available, remaining);
      allocations.push({
        stockId: stock.id,
        warehouse: stock.warehouse,
        binLocation: stock.binLocation,
        qty: consumed,
      });
      remaining -= consumed;
    }

    if (remaining > 0 && stocks[0]) {
      const first = stocks[0];
      const existing = allocations.find((row) => row.stockId === first.id);
      if (existing) existing.qty += remaining;
      else {
        allocations.push({
          stockId: first.id,
          warehouse: first.warehouse,
          binLocation: first.binLocation,
          qty: remaining,
        });
      }
    }

    return allocations;
  }

  private async allocateByPreferredBreakdown(
    tx: Prisma.TransactionClient,
    tenantId: string,
    inventoryItemId: string,
    stocks: LedgerStockRow[],
    qty: number,
    preferred: StockBreakdownInput[],
  ) {
    const stockMap = new Map(stocks.map((stock) => [stock.id, stock]));
    const allocations: Array<{ stockId: string; warehouse?: string | null; binLocation?: string | null; qty: number }> = [];

    let assigned = 0;
    for (const row of preferred) {
      const normalizedQty = Number(row.qty ?? 0);
      if (!Number.isFinite(normalizedQty) || normalizedQty <= 0) continue;
      if (assigned >= qty) break;

      let stock = row.inventoryStockId ? stockMap.get(row.inventoryStockId) : undefined;
      if (!stock && (row.warehouse || row.binLocation)) {
        stock = stocks.find(
          (candidate) => (candidate.warehouse ?? null) === (row.warehouse ?? null)
            && (candidate.binLocation ?? null) === (row.binLocation ?? null),
        );
      }

      if (!stock) {
        stock = await tx.inventoryStock.create({
          data: {
            tenantId,
            inventoryItemId,
            warehouse: row.warehouse ?? undefined,
            binLocation: row.binLocation ?? undefined,
            stockOnHand: 0,
          },
          select: {
            id: true,
            warehouse: true,
            binLocation: true,
            stockOnHand: true,
          },
        });
        stocks.push(stock);
        stockMap.set(stock.id, stock);
      }

      const remaining = qty - assigned;
      const take = Math.min(normalizedQty, remaining);
      allocations.push({
        stockId: stock.id,
        warehouse: stock.warehouse,
        binLocation: stock.binLocation,
        qty: take,
      });
      assigned += take;
    }

    if (assigned < qty && stocks[0]) {
      const first = stocks[0];
      allocations.push({
        stockId: first.id,
        warehouse: first.warehouse,
        binLocation: first.binLocation,
        qty: qty - assigned,
      });
    }

    return allocations;
  }
}
