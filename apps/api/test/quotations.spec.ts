import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationPipe } from '@nestjs/common';
import { amount, D, documentFile, progress, quantity, remaining } from '../src/modules/quotations/quotations.domain';
import { ActionDto, CreateQuotationDto } from '../src/modules/quotations/quotations.dto';

test('commercial totals use decimal line rounding rather than binary arithmetic', () => {
  assert.equal(amount([{ quantity: '3', unitPrice: '0.10', taxPct: '19' }, { quantity: '1.5', unitPrice: '100.01', taxPct: '0' }]), '150.38');
  assert.equal(amount([{ quantity: '0.5', unitPrice: '0.01', taxPct: '0' }]), '0.01');
});
test('partial quantities cannot exceed an approved or operational balance', () => {
  assert.throws(() => quantity('0'));
  assert.throws(() => remaining('1', '0.9', '0.100001', 'Entrega'));
  assert.doesNotThrow(() => remaining('1', '0.9', '0.1', 'Entrega'));
});
test('case completion requires accepted service, invoicing and confirmed part delivery', () => {
  const part = { kind: 'PART', route: 'BUY', approvedQty: D(2), orderedQty: D(2), receivedQty: D(2), invoicedQty: D(2), deliveredQty: D(1) };
  const service = { kind: 'SERVICE', route: 'SERVICE', approvedQty: D(1), executedQty: D(1), invoicedQty: D(0) };
  assert.equal(progress([part, service]).complete, false);
  assert.deepEqual(progress([part, service]), { procurement: 0, reception: 0, service: 0, invoice: 1, delivery: 1, complete: false });
  assert.equal(progress([{ ...part, deliveredQty: D(2) }, { ...service, invoicedQty: D(1) }]).complete, true);
  assert.equal(progress([]).complete, false);
});
test('evidence validation checks file content, size, extension and sanitizes names', () => {
  assert.throws(() => documentFile({ buffer: Buffer.from('<html>'), originalname: 'quote.pdf', size: 6 }));
  const pdf = documentFile({ buffer: Buffer.from('%PDF-1.7\nevidence'), originalname: '../quote.pdf', size: 17 });
  assert.equal(pdf.mimeType, 'application/pdf'); assert.equal(pdf.filename, '.._quote.pdf'); assert.equal(pdf.sha256.length, 64);
  assert.throws(() => documentFile({ buffer: Buffer.alloc(10 * 1024 * 1024 + 1), originalname: 'quote.pdf', size: 1 }));
});
test('API rejects injected tenant, invalid nested lines and invalid transitions at the boundary', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  await assert.rejects(pipe.transform({ version: 1, action: 'APPROVE', tenantId: 'other' }, { type: 'body', metatype: ActionDto }));
  await assert.rejects(pipe.transform({ version: 1, action: 'BYPASS' }, { type: 'body', metatype: ActionDto }));
  await assert.rejects(pipe.transform({ lines: [{ quantity: '-1', taxPct: 'NaN' }] }, { type: 'body', metatype: CreateQuotationDto }));
});

test('dispatch chooses free bins and preserves manufacturing reservations', async () => {
  const { QuotationsService } = await import('../src/modules/quotations/quotations.service');
  const service = new QuotationsService({} as any, {} as any) as any;
  const tx = {
    $queryRaw: async () => [],
    inventoryItem: { findFirst: async () => ({ qty: 10, stocks: [{ id: 'reserved-bin', stockOnHand: 3 }, { id: 'free-bin', stockOnHand: 7 }] }) },
    manufacturingStockReservation: { findMany: async () => [{ inventoryStockId: 'reserved-bin', reservedQuantity: D(3), issuedQuantity: D(0), releasedQuantity: D(0) }] },
    quotationLine: { findMany: async () => [] },
  };
  assert.deepEqual(await service.available(tx, { tenantId: 'test' }, 'item', D(7), 'own-line'), [{ inventoryStockId: 'free-bin', qty: 7 }]);
  await assert.rejects(service.available(tx, { tenantId: 'test' }, 'item', D('7.000001'), 'own-line'));
});
test('availability accounts for received commercial quantities still awaiting dispatch', async () => {
  const { QuotationsService } = await import('../src/modules/quotations/quotations.service');
  const service = new QuotationsService({} as any, {} as any) as any;
  const tx = {
    $queryRaw: async () => [],
    inventoryItem: { findFirst: async () => ({ qty: 5, stocks: [{ id: 'bin', stockOnHand: 5 }] }) },
    manufacturingStockReservation: { findMany: async () => [] },
    quotationLine: { findMany: async () => [{ receivedQty: D(4), dispatchedQty: D(1) }] },
  };
  await assert.rejects(service.available(tx, { tenantId: 'test' }, 'item', D(3)));
  assert.deepEqual(await service.available(tx, { tenantId: 'test' }, 'item', D(2)), [{ inventoryStockId: 'bin', qty: 2 }]);
});
