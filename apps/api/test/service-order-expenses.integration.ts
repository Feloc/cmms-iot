import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma.service';
import { tenantStorage } from '../src/common/tenant-context';
import { ServiceOrderExpensesService } from '../src/modules/service-orders/service-order-expenses.service';

// Build the previous schema in a private PostgreSQL schema, then apply the real SQL twice.
// No application data is read or modified. The private schema and files are removed in finally.
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es requerido');
  const migration = await fs.readFile(process.env.EXPENSES_MIGRATION_FILE || resolve(__dirname, '../../../db/migrations/63_service_order_expenses.sql'), 'utf8');
  const source = await fs.readFile(resolve('prisma/schema.prisma'), 'utf8');
  let baseline = source;
  for (const name of ['ServiceOrderExpense', 'ServiceOrderExpenseEvent', 'ServiceExpenseCategory', 'ServiceExpensePaidBy']) {
    baseline = baseline.replace(new RegExp(`^(?:model|enum) ${name} \\{[\\s\\S]*?^\\}`, 'm'), '');
  }
  baseline = baseline.replace(/^.*\b(?:serviceOrderExpenses|expenseId|expenses\s+ServiceOrderExpense\[\]|expense\s+ServiceOrderExpense\?).*\r?\n/gm, '');
  baseline = baseline.replace(/(model WorkOrder \{[\s\S]*?)  @@unique\(\[tenantId, id\]\)\r?\n/, '$1');
  const schemaName = `expense_test_${randomUUID().replace(/-/g, '')}`;
  const databaseUrl = new URL(process.env.DATABASE_URL);
  databaseUrl.searchParams.set('schema', schemaName);
  const directory = await fs.mkdtemp(join(tmpdir(), 'service-expenses-db-'));
  const schemaFile = join(directory, 'baseline.prisma');
  const previousStorage = process.env.ATTACHMENTS_DIR;
  process.env.ATTACHMENTS_DIR = join(directory, 'receipts');
  const admin = new PrismaClient();
  const db = new PrismaService({ datasourceUrl: databaseUrl.toString() });
  const cli = (args: string[], stdin?: string) => {
    const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], {
      input: stdin, encoding: 'utf8', env: { ...process.env, DATABASE_URL: databaseUrl.toString() }, timeout: 120000,
    });
    assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
  };
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    await fs.writeFile(schemaFile, baseline);
    cli(['db', 'push', '--schema', schemaFile, '--skip-generate']);
    cli(['db', 'execute', '--schema', schemaFile, '--stdin'], migration);
    cli(['db', 'execute', '--schema', schemaFile, '--stdin'], migration);
    console.log('PASS migration applies to the previous schema and can be reapplied');

    const tenant = await db.tenant.create({ data: { slug: 'expense-test', name: 'Expense test' } });
    const otherTenant = await db.tenant.create({ data: { slug: 'expense-other', name: 'Other tenant' } });
    const tech = await db.user.create({ data: { tenantId: tenant.id, name: 'Técnica', email: 'tech@expense.invalid', password: 'synthetic-unusable-password', role: 'TECH' } });
    const order = await db.workOrder.create({ data: { tenantId: tenant.id, title: 'Synthetic service', assetCode: 'TEST', kind: 'SERVICE_ORDER', status: 'CLOSED' } });
    const assignment = await db.wOAssignment.create({ data: { tenantId: tenant.id, userId: tech.id, workOrderId: order.id } });
    const service = new ServiceOrderExpensesService(db);
    const run = (callback: () => Promise<any>) => tenantStorage.run({ tenantId: tenant.id, userId: tech.id }, callback);
    const body = { expenseDate: '2026-10-25', category: 'MEALS', description: 'Almuerzo de prueba', amount: '0.10', paidBy: 'EMPLOYEE' };
    const a = await run(() => service.create(order.id, body));
    await run(() => service.create(order.id, { ...body, amount: '0.20', paidBy: 'COMPANY' }));
    assert.equal((await run(() => service.list(order.id))).summary.total, '0.30');
    assert.equal(a.expenseDate, '2026-10-25');
    const concurrent = await run(() => Promise.allSettled([
      service.update(order.id, a.id, { ...body, amount: '10.25', version: 1 }),
      service.update(order.id, a.id, { ...body, amount: '10.25', version: 1 }),
    ]));
    assert.equal(concurrent.filter((result: any) => result.status === 'fulfilled').length, 1);
    assert.match(String(concurrent.find((result: any) => result.status === 'rejected').reason), /cambió/);
    console.log('PASS exact decimal totals, closed-service expenses and concurrent version protection');

    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
    await run(() => service.addReceipts(order.id, a.id, [{ originalname: 'factura.pdf', mimetype: 'application/pdf', buffer: pdf }]));
    const data = await run(() => service.list(order.id));
    const expense = data.items.find((row: any) => row.id === a.id);
    assert.equal(expense.receipts.length, 1);
    const opened = await run(() => service.receipt(order.id, a.id, expense.receipts[0].id));
    try { assert.deepEqual(await opened.handle.readFile(), pdf); } finally { await opened.handle.close(); }
    await assert.rejects(db.serviceOrderExpense.create({ data: { tenantId: otherTenant.id, workOrderId: order.id, createdByUserId: tech.id, createdByName: 'Synthetic', expenseDate: new Date('2026-10-25'), category: 'MEALS', description: 'Cross tenant', amount: '1', paidBy: 'COMPANY' } }));
    await assert.rejects(db.attachment.create({ data: { tenantId: otherTenant.id, expenseId: a.id, filename: 'fake.pdf', mimeType: 'application/pdf', size: 1, type: 'DOCUMENT', url: 'fake', createdBy: tech.id } }));
    await db.wOAssignment.update({ where: { id: assignment.id }, data: { state: 'REMOVED' } });
    await assert.rejects(run(() => service.list(order.id)), /asignado/);
    await db.wOAssignment.update({ where: { id: assignment.id }, data: { state: 'ACTIVE' } });
    await run(() => service.void(order.id, a.id, { version: expense.version }));
    assert.equal((await run(() => service.list(order.id))).summary.total, '0.20');
    assert.equal(await db.attachment.count({ where: { expenseId: a.id } }), 1);
    assert.equal(await db.serviceOrderExpenseEvent.count({ where: { expenseId: a.id } }), 4);
    console.log('PASS private receipt persistence, tenant foreign keys, removed assignments and auditable voids');
  } finally {
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.$disconnect();
    await fs.rm(directory, { recursive: true, force: true });
    if (previousStorage === undefined) delete process.env.ATTACHMENTS_DIR;
    else process.env.ATTACHMENTS_DIR = previousStorage;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
