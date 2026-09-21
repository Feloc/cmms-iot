import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLedgerService } from '../src/modules/inventory/inventory-ledger.service';

function setup(legacy = false) {
  const stocks: any[] = legacy ? [] : [{ id: 'stock-1', warehouse: 'Principal', binLocation: null, stockOnHand: 10 }];
  const item = { id: 'item-1', tenantId: 'tenant-1', qty: 10, stocks };
  const movements: any[] = [];
  let transactions = 0;
  let nextStockId = stocks.length;
  const tx = {
    inventoryItem: {
      findFirst: async ({ where }: any) => where.tenantId === item.tenantId && where.id === item.id ? item : null,
      update: async ({ data }: any) => Object.assign(item, data),
    },
    inventoryStock: {
      create: async ({ data }: any) => ({ id: `stock-${++nextStockId}`, ...data }),
      update: async ({ where, data }: any) => Object.assign(stocks.find((s) => s.id === where.id) ?? {}, data),
    },
    inventoryMovement: { createMany: async ({ data }: any) => movements.push(...data) },
  };
  const prisma = { $transaction: async (fn: any, options: any) => {
    transactions++;
    assert.equal(options.isolationLevel, 'Serializable');
    return fn(tx);
  } };
  return { service: new InventoryLedgerService(prisma as any), item, stocks, movements, prisma, transactions: () => transactions };
}

test('receipt adds quantity and records the user, reference and resulting balance', async () => {
  const f = setup();
  const result = await f.service.receiveStock('tenant-1', 'item-1', {
    qty: 2.5, inventoryStockId: 'stock-1', referenceLabel: ' OC-12 ', note: ' Entrega ',
  }, 'user-1');
  assert.equal(result.balanceAfter, 12.5);
  assert.equal(f.stocks[0].stockOnHand, 12.5);
  assert.equal(f.movements.length, 1);
  assert.equal(f.movements[0].movementType, 'ENTRY');
  assert.equal(f.movements[0].source, 'MANUAL');
  assert.equal(f.movements[0].createdByUserId, 'user-1');
  assert.equal(f.movements[0].referenceLabel, 'OC-12');
  assert.equal(f.movements[0].stockDelta, 2.5);
});

test('new location preserves legacy inventory balance', async () => {
  const f = setup(true);
  const result = await f.service.receiveStock('tenant-1', 'item-1', { qty: 3, warehouse: 'Nueva' });
  assert.equal(result.balanceAfter, 13);
  assert.equal(f.movements[0].warehouse, 'Nueva');
});

test('invalid quantities and destinations cannot create receipts', async () => {
  const f = setup();
  for (const qty of [0, -1, NaN, Infinity]) {
    await assert.rejects(f.service.receiveStock('tenant-1', 'item-1', { qty, inventoryStockId: 'stock-1' }));
  }
  await assert.rejects(f.service.receiveStock('tenant-1', 'item-1', { qty: 1 }));
  await assert.rejects(f.service.receiveStock('tenant-1', 'item-1', { qty: 1, inventoryStockId: 'foreign-stock' }));
  await assert.rejects(f.service.receiveStock('other-tenant', 'item-1', { qty: 1, warehouse: 'Principal' }));
  assert.equal(f.movements.length, 0);
  assert.equal(f.item.qty, 10);
});

test('serialization conflicts are retried without duplicating the receipt', async () => {
  const f = setup();
  const transaction = f.prisma.$transaction;
  let attempts = 0;
  f.prisma.$transaction = async (fn, options) => {
    if (++attempts === 1) throw Object.assign(new Error('Conflict'), { code: 'P2034' });
    return transaction(fn, options);
  };
  await f.service.receiveStock('tenant-1', 'item-1', { qty: 2, inventoryStockId: 'stock-1' });
  assert.equal(attempts, 2);
  assert.equal(f.movements.length, 1);
  assert.equal(f.item.qty, 12);
});
