import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { ServiceOrderExpensesService } from '../src/modules/service-orders/service-order-expenses.service';
import { ServiceOrderExpensesController } from '../src/modules/service-orders/service-order-expenses.controller';
import { ServiceOrderExpenseUploadGuard } from '../src/modules/service-orders/service-order-expense-upload.guard';
import { expenseBody, expenseReceipt, expenseReceiptPath, expenseVersion } from '../src/modules/service-orders/service-order-expenses.domain';
import { AttachmentsService } from '../src/modules/attachments/attachments.service';
import { tenantStorage } from '../src/common/tenant-context';

const body = { expenseDate: '2026-10-25', category: 'TRANSPORT', description: 'Taxi a planta', amount: '25000.50', paidBy: 'EMPLOYEE' };
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const file = { originalname: 'factura.pdf', mimetype: 'application/pdf', buffer: pdf };

function clone(value: any): any {
  if (value instanceof Date) return new Date(value);
  if (Prisma.Decimal.isDecimal(value)) return new Prisma.Decimal(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  return value;
}

function setup() {
  const actors: Record<string, any> = {
    admin: { id: 'admin', name: 'Administradora', role: 'ADMIN' },
    tech: { id: 'tech', name: 'Técnica', role: 'TECH' },
    peer: { id: 'peer', name: 'Compañero', role: 'TECH' },
    outsider: { id: 'outsider', name: 'No asignado', role: 'TECH' },
    viewer: { id: 'viewer', name: 'Consulta', role: 'VIEWER' },
  };
  let expenses = new Map<string, any>(), receipts = new Map<string, any>(), events: any[] = [];
  let sequence = 0, failAudit = false, failCommit = false;
  const matches = (row: any, where: any) => row && Object.entries(where).every(([key, value]) => row[key] === value);
  const expanded = (row: any) => ({ ...clone(row), receipts: [...receipts.values()].filter(receipt => receipt.expenseId === row.id).map(({ url, ...receipt }) => clone(receipt)), events: events.filter(event => event.expenseId === row.id).map(clone) });
  const tx: any = {
    user: { findFirst: async ({ where }: any) => where.tenantId === 'tenant' ? actors[where.id] || null : null },
    workOrder: { findFirst: async ({ where, select }: any) => where.tenantId === 'tenant' && ['order', 'other-order'].includes(where.id) && where.kind === 'SERVICE_ORDER' ? { id: where.id, assignments: ['tech', 'peer'].includes(select.assignments.where.userId) ? [{ id: 'assignment' }] : [] } : null },
    serviceOrderExpense: {
      create: async ({ data }: any) => { const row = { ...data, id: `expense-${++sequence}`, version: 1, currency: 'COP', voidedAt: null, createdAt: new Date(), updatedAt: new Date() }; expenses.set(row.id, row); return clone(row); },
      findFirst: async ({ where }: any) => { const row = [...expenses.values()].find(row => matches(row, where)); return row ? expanded(row) : null; },
      findMany: async ({ where }: any) => [...expenses.values()].filter(row => matches(row, where)).map(expanded),
      updateMany: async ({ where, data }: any) => { const row = [...expenses.values()].find(row => matches(row, where)); if (!row) return { count: 0 }; const { version, ...rest } = data; Object.assign(row, rest, { version: row.version + version.increment, updatedAt: new Date() }); return { count: 1 }; },
    },
    serviceOrderExpenseEvent: { create: async ({ data }: any) => { if (failAudit) throw new Error('Audit failure'); const event = { ...data, id: `event-${++sequence}`, createdAt: new Date() }; events.push(event); return event; } },
    attachment: {
      create: async ({ data, select }: any) => { const row = { ...data, id: `receipt-${++sequence}`, createdAt: new Date() }; receipts.set(row.id, row); return clone(select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row); },
      findFirst: async ({ where }: any) => clone([...receipts.values()].find(row => matches(row, where)) || null),
      findMany: async ({ where }: any) => [...receipts.values()].filter(row => matches(row, where)).map(clone),
      count: async ({ where }: any) => [...receipts.values()].filter(row => matches(row, where)).length,
      delete: async ({ where }: any) => { const row = receipts.get(where.id); receipts.delete(where.id); return row; },
    },
  };
  const prisma: any = { ...tx, $transaction: async (callback: any) => {
    if (Array.isArray(callback)) return Promise.all(callback);
    const before = { expenses: new Map([...expenses].map(([id, row]) => [id, clone(row)])), receipts: new Map([...receipts].map(([id, row]) => [id, clone(row)])), events: clone(events) };
    try { const result = await callback(tx); if (failCommit) throw new Error('Commit failure'); return result; }
    catch (error) { expenses = before.expenses; receipts = before.receipts; events = before.events; throw error; }
  } };
  return {
    service: new ServiceOrderExpensesService(prisma), attachments: new AttachmentsService(prisma),
    run: (callback: () => Promise<any>, userId = 'admin', tenantId = 'tenant') => tenantStorage.run({ tenantId, userId }, callback),
    expenses: () => [...expenses.values()], receipts: () => [...receipts.values()], events: () => events,
    failAudit: (value: boolean) => { failAudit = value; }, failCommit: (value: boolean) => { failCommit = value; },
  };
}

async function withStorage(callback: (directory: string) => Promise<void>) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'service-expenses-test-'));
  const previous = process.env.ATTACHMENTS_DIR;
  process.env.ATTACHMENTS_DIR = directory;
  try { await callback(directory); }
  finally { await fs.rm(directory, { recursive: true, force: true }); if (previous === undefined) delete process.env.ATTACHMENTS_DIR; else process.env.ATTACHMENTS_DIR = previous; }
}

test('money, dates, categories and version are strictly validated at the service boundary', () => {
  assert.equal(expenseBody(body).amount.toFixed(2), '25000.50');
  for (const invalid of [null, [], {}, { ...body, amount: 25 }, { ...body, amount: '0' }, { ...body, amount: '-1' }, { ...body, amount: '1e3' }, { ...body, amount: '1.001' }, { ...body, amount: '1000000000000' }, { ...body, expenseDate: '2026-02-30' }, { ...body, category: '__proto__' }, { ...body, description: ' ' }, { ...body, paidBy: 'OTHER' }, { ...body, tenantId: 'other' }]) assert.throws(() => expenseBody(invalid));
  assert.equal(expenseBody({ ...body, amount: '999999999999.99' }).amount.toString(), '999999999999.99');
  assert.equal(expenseVersion({ version: 1 }), 1);
  for (const invalid of [{}, { version: '1' }, { version: 0 }, { version: 1.5 }, { version: 1, amount: '100' }]) assert.throws(() => expenseVersion(invalid, true));
});

test('expense access requires an authenticated administrator or assigned technician in the same tenant', async () => {
  const s = setup();
  await assert.rejects(s.service.list('order'), /sesión/);
  for (const user of ['viewer', 'outsider', 'missing']) await assert.rejects(s.run(() => s.service.create('order', body), user), /acceso|asignado/);
  await assert.rejects(s.run(() => s.service.list('order'), 'admin', 'other-tenant'), /acceso/);
  await assert.rejects(s.run(() => s.service.create('missing-order', body)), /encontrada/);
  const expense = await s.run(() => s.service.create('order', body), 'tech');
  await assert.rejects(s.run(() => s.service.update('order', expense.id, { ...body, amount: '100', version: 1 }), 'peer'), /propios/);
  await assert.rejects(s.run(() => s.service.void('order', expense.id, { version: 1 }), 'peer'), /propios/);
  await assert.rejects(s.run(() => s.service.update('other-order', expense.id, { ...body, version: 1 })), /encontrado/);
  assert.equal((await s.run(() => s.service.list('order'), 'peer')).items[0].canEdit, false);
  assert.equal((await s.run(() => s.service.list('order'))).items[0].canEdit, true);
});

test('totals use decimal arithmetic, edits reject stale versions and voids retain audit history', async () => {
  const s = setup();
  const a = await s.run(() => s.service.create('order', { ...body, amount: '0.10' }), 'tech');
  const b = await s.run(() => s.service.create('order', { ...body, category: 'MEALS', amount: '0.20', paidBy: 'COMPANY' }));
  let data = await s.run(() => s.service.list('order'));
  assert.equal(data.summary.total, '0.30'); assert.equal(data.summary.employeePaid, '0.10'); assert.equal(data.summary.companyPaid, '0.20'); assert.equal(data.summary.withoutReceipts, 2);
  await s.run(() => s.service.update('order', a.id, { ...body, amount: '30.15', version: 1 }), 'tech');
  await assert.rejects(s.run(() => s.service.update('order', a.id, { ...body, version: 1 })), /cambió/);
  await assert.rejects(s.run(() => s.service.void('order', a.id, { version: 1 })), /cambió/);
  await s.run(() => s.service.void('order', a.id, { version: 2 }), 'tech');
  data = await s.run(() => s.service.list('order'));
  assert.equal(data.summary.total, '0.20'); assert.equal(data.summary.count, 1); assert.equal(data.items.length, 2);
  assert.equal(data.items.find((expense: any) => expense.id === a.id).canEdit, false);
  assert.deepEqual(s.events().filter(event => event.expenseId === a.id).map(event => event.action), ['CREATED', 'UPDATED', 'VOIDED']);
  assert.equal(s.events().find(event => event.action === 'UPDATED').details.before.amount, '0.10');
  assert.equal(s.events().find(event => event.action === 'UPDATED').details.after.amount, '30.15');
  await assert.rejects(s.run(() => s.service.update('order', a.id, { ...body, version: 3 })), /anulado/);
  const workbook = XLSX.read(await s.run(() => s.service.export('order')), { type: 'buffer' });
  assert.deepEqual(workbook.SheetNames, ['Gastos', 'Resumen', 'Historial']);
  const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets.Gastos);
  assert.equal(rows.length, 2); assert.equal(rows.find(row => row['ID gasto'] === a.id).Estado, 'Anulado');
  assert.equal(rows.find(row => row['ID gasto'] === b.id).Valor, 0.2);
  assert.equal((XLSX.utils.sheet_to_json(workbook.Sheets.Resumen) as any[])[0].Valor, 0.2);
});

test('receipts validate actual contents, size, allowed formats and safe storage paths', () => {
  assert.equal(expenseReceipt(file).mimeType, 'application/pdf');
  assert.equal(expenseReceipt({ ...file, originalname: '../../factura\r\n.pdf' }).filename, 'factura.pdf');
  for (const invalid of [{ ...file, buffer: Buffer.from('<html>fake pdf</html>') }, { ...file, originalname: 'factura.svg' }, { ...file, mimetype: 'image/png' }, { ...file, buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }]) assert.throws(() => expenseReceipt(invalid));
  assert.throws(() => expenseReceiptPath('../../invoice.pdf'));
});

test('receipts stay private, link to their expense, support late uploads and preserve deletion history', async () => {
  await withStorage(async () => {
    const s = setup();
    const expense = await s.run(() => s.service.create('order', body), 'tech');
    await assert.rejects(s.run(() => s.service.authorizeReceiptUpload('order', expense.id), 'peer'), /propios/);
    await s.run(() => s.service.addReceipts('order', expense.id, [file, { ...file, originalname: 'segunda.pdf' }]), 'tech');
    const [receipt] = s.receipts();
    assert.deepEqual(await fs.readFile(expenseReceiptPath(receipt.url)), pdf);
    const data = await s.run(() => s.service.list('order'));
    assert.equal(data.summary.withoutReceipts, 0);
    assert.equal(data.items[0].receipts.length, 2);
    assert.equal(JSON.stringify(data).includes('storageKey'), false);
    assert.equal(JSON.stringify(data).includes(receipt.url), false);
    const opened = await s.run(() => s.service.receipt('order', expense.id, receipt.id), 'peer');
    try { assert.deepEqual(await opened.handle.readFile(), pdf); } finally { await opened.handle.close(); }
    await assert.rejects(s.run(() => s.service.receipt('other-order', expense.id, receipt.id)), /encontrado/);
    await assert.rejects(s.run(() => s.service.receipt('order', 'wrong-expense', receipt.id)), /encontrado/);
    await assert.rejects(s.run(() => s.attachments.findOne(receipt.id)), /not found/);
    await assert.rejects(s.run(() => s.attachments.remove(receipt.id)), /gastos/);
    assert.equal((await s.run(() => s.attachments.findAll({ workOrderId: 'order' }))).total, 0);
    await assert.rejects(s.run(() => s.service.removeReceipt('order', expense.id, receipt.id), 'peer'), /propios/);
    await s.run(() => s.service.removeReceipt('order', expense.id, receipt.id), 'tech');
    await assert.rejects(fs.access(expenseReceiptPath(receipt.url)));
    assert.equal(s.events().at(-1).action, 'RECEIPT_REMOVED');
    assert.equal(s.events().at(-1).details.receipt.filename, 'factura.pdf');
    const current = (await s.run(() => s.service.list('order'))).items[0];
    await s.run(() => s.service.void('order', expense.id, { version: current.version }));
    await assert.rejects(s.run(() => s.service.addReceipts('order', expense.id, [file])), /anulado/);
    assert.equal(s.receipts().length, 1);
  });
});

test('failed commits and audit writes roll back expense rows and receipt bytes', async () => {
  await withStorage(async directory => {
    const s = setup();
    s.failAudit(true);
    await assert.rejects(s.run(() => s.service.create('order', body)), /Audit failure/);
    assert.equal(s.expenses().length, 0);
    s.failAudit(false);
    const expense = await s.run(() => s.service.create('order', body));
    for (const mode of ['audit', 'commit']) {
      s.failAudit(mode === 'audit'); s.failCommit(mode === 'commit');
      await assert.rejects(s.run(() => s.service.addReceipts('order', expense.id, [file, file])), /failure/);
      assert.equal(s.receipts().length, 0);
      assert.equal(s.expenses()[0].version, 1);
      assert.deepEqual(await fs.readdir(join(directory, 'expense-receipts')), []);
    }
    s.failAudit(false); s.failCommit(false);
    await s.run(() => s.service.addReceipts('order', expense.id, Array.from({ length: 10 }, () => file)));
    await assert.rejects(s.run(() => s.service.addReceipts('order', expense.id, [file])), /máximo 10/);
    assert.equal(s.receipts().length, 10);
    assert.equal((await fs.readdir(join(directory, 'expense-receipts'))).length, 10);
  });
});

test('HTTP validates bodies, rejects unauthorized multipart before buffering, downloads supports and exports Excel', async () => {
  await withStorage(async () => {
    const s = setup();
    @Module({ controllers: [ServiceOrderExpensesController], providers: [{ provide: ServiceOrderExpensesService, useValue: s.service }, ServiceOrderExpenseUploadGuard] })
    class TestModule {}
    const app = await NestFactory.create(TestModule, { logger: false });
    app.use((request: any, _response: any, next: () => void) => tenantStorage.run({ tenantId: 'tenant', userId: request.headers['x-test-user'] || 'admin' }, next));
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const base = `http://127.0.0.1:${address.port}/service-orders/order/expenses`;
    const json = { 'Content-Type': 'application/json', 'x-test-user': 'tech' };
    try {
      assert.equal((await fetch(base, { headers: { 'x-test-user': 'viewer' } })).status, 403);
      assert.equal((await fetch(base, { method: 'POST', headers: json, body: JSON.stringify({ ...body, amount: 5 }) })).status, 400);
      const created = await fetch(base, { method: 'POST', headers: json, body: JSON.stringify(body) });
      assert.equal(created.status, 201);
      const expense: any = await created.json();
      const upload = (user = 'tech', buffer = pdf, filename = 'factura.pdf') => { const form = new FormData(); form.append('files', new Blob([buffer], { type: 'application/pdf' }), filename); return fetch(`${base}/${expense.id}/receipts`, { method: 'POST', headers: { 'x-test-user': user }, body: form }); };
      assert.equal((await upload('peer')).status, 403);
      assert.equal((await upload('outsider')).status, 403);
      assert.equal((await upload('tech', Buffer.from('fake pdf'))).status, 400);
      assert.equal((await upload()).status, 201);
      const receipt = s.receipts()[0];
      const viewed = await fetch(`${base}/${expense.id}/receipts/${receipt.id}`);
      assert.equal(viewed.status, 200); assert.match(viewed.headers.get('content-disposition') || '', /inline/);
      assert.equal(viewed.headers.get('cache-control'), 'private, no-store');
      assert.deepEqual(Buffer.from(await viewed.arrayBuffer()), pdf);
      assert.equal((await fetch(`${base}/${expense.id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ ...body, version: 1 }) })).status, 409);
      const exported = await fetch(`${base}/export`);
      assert.equal(exported.status, 200);
      assert.match(exported.headers.get('content-type') || '', /spreadsheetml/);
      assert.equal(XLSX.read(Buffer.from(await exported.arrayBuffer()), { type: 'buffer' }).SheetNames.length, 3);
    } finally { await app.close(); }
  });
});
