import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { tenantStorage } from '../src/common/tenant-context';
import { QuotationsModule } from '../src/modules/quotations/quotations.module';

@Module({ imports: [QuotationsModule, JwtModule.register({ global: true, secret: 'quotations-isolated-test' })], providers: [PrismaService, { provide: APP_GUARD, useClass: JwtAuthGuard }] })
class TestApp {}
async function main() {
  // Explicit test connection: never falls back to the application's DATABASE_URL.
  const originalUrl = process.env.QUOTATIONS_TEST_DATABASE_URL || 'postgresql://postgres:quotations-isolated-test@127.0.0.1:55465/quotations_test';
  if (!new URL(originalUrl).pathname.endsWith('/quotations_test')) throw new Error('Usa una base aislada llamada quotations_test');
  const admin = new PrismaClient({ datasourceUrl: originalUrl }), schemaName = 'quotations_test_' + randomUUID().replace(/-/g, '');
  const url = new URL(originalUrl); url.searchParams.set('schema', schemaName);
  const directory = await fs.mkdtemp(join(tmpdir(), 'quotations-test-')), schemaFile = join(directory, 'baseline.prisma');
  const previousStorage = process.env.ATTACHMENTS_DIR, previousDb = process.env.DATABASE_URL;
  process.env.ATTACHMENTS_DIR = join(directory, 'files');
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined, checks = 0;
  const cli = (args: string[], input?: string) => {
    const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], { input, encoding: 'utf8', timeout: 120000, env: { ...process.env, DATABASE_URL: url.toString() } });
    assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
  };
  try {
    let baseline = await fs.readFile(resolve('prisma/schema.prisma'), 'utf8');
    baseline = baseline.replace(/^model Quotation\w* \{[\s\S]*?^\}/gm, '').replace(/^\s*quotations\s+Quotation\[\]\r?\n/m, '\n');
    await fs.writeFile(schemaFile, baseline);
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    cli(['db', 'push', '--schema', schemaFile, '--skip-generate']);
    const migration = await fs.readFile(resolve('../../db/migrations/65_quotations.sql'), 'utf8');
    cli(['db', 'execute', '--schema', schemaFile, '--stdin'], migration);
    cli(['db', 'execute', '--schema', schemaFile, '--stdin'], migration);
    console.log('PASS real additive migration, including repeated execution');
    process.env.DATABASE_URL = url.toString();
    app = await NestFactory.create(TestApp, { logger: false });
    app.use((_req: any, _res: any, next: any) => tenantStorage.run({}, next));
    const db = app.get(PrismaService), jwt = app.get(JwtService);
    const tenant = await db.tenant.create({ data: { slug: 'quote-test', name: 'Quotation test' } });
    const other = await db.tenant.create({ data: { slug: 'quote-other', name: 'Other' } });
    const users = await Promise.all(['admin', 'tech', 'buyer', 'warehouse', 'billing', 'logistics', 'viewer', 'external', 'unassigned'].map((name, i) => db.user.create({ data: { tenantId: i === 7 ? other.id : tenant.id, name, email: name + '@quote.invalid', password: 'synthetic-unusable-password', role: i === 0 || i === 7 ? 'ADMIN' : i === 6 ? 'VIEWER' : 'TECH' } })));
    const tokens = users.map(u => jwt.sign({ sub: u.id, tenantId: u.tenantId, authVersion: u.authVersion }));
    await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
    const request = async (who: number, route: string, method = 'GET', body?: any, expected = 200): Promise<any> => {
      const response = await fetch(base + '/quotations' + route, { method, headers: { Authorization: `Bearer ${tokens[who]}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, ...(body !== undefined ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
      const text = await response.text(); assert.equal(response.status, expected, `${method} ${route}: ${text}`); checks++;
      try { return JSON.parse(text); } catch { return text; }
    };
    const permissions: Record<number, string[]> = { 1: ['READ', 'QUOTE', 'SERVICE'], 2: ['READ', 'SOURCE', 'PURCHASE'], 3: ['READ', 'RECEIVE'], 4: ['READ', 'INVOICE'], 5: ['READ', 'DISPATCH'], 6: ['READ'] };
    for (const [i, capabilities] of Object.entries(permissions)) await request(0, '/access', 'POST', { userId: users[Number(i)].id, capabilities }, 201);
    await request(1, '/access', 'POST', { userId: users[1].id, capabilities: ['PURCHASE'] }, 403);
    await request(0, '/access', 'POST', { userId: users[7].id, capabilities: ['READ'] }, 400);
    await request(0, '/access', 'POST', { userId: users[6].id, capabilities: ['INVOICE'] }, 400);
    const inv = await db.inventoryItem.create({ data: { tenantId: tenant.id, sku: 'Q-PART', name: 'Repuesto', qty: 0 } });
    const lineInput = { kind: 'PART', route: 'BUY', description: 'Repuesto', uom: 'UND', quantity: '2', unitPrice: '100.10', taxPct: '19', inventoryItemId: inv.id };
    const input = { title: 'Solicitud de repuesto', customerName: 'Cliente', contactName: 'Contacto', description: 'Solicitud por correo', currency: 'COP', coordinatorId: users[1].id, lines: [lineInput] };
    await request(6, '', 'POST', input, 403); await request(0, '', 'POST', { ...input, tenantId: other.id }, 400);
    let row = await request(1, '', 'POST', input, 201);
    await request(7, '/' + row.id, 'GET', undefined, 404); await request(8, '/' + row.id, 'GET', undefined, 404);
    assert.equal((await request(7, '')).total, 0); assert.equal((await request(8, '')).total, 0);
    const action = async (who: number, action: string, fields: any = {}, expected = 201) => { const r = await request(who, `/${row.id}/actions`, 'POST', { version: row.version, action, ...fields }, expected); if (expected === 201) row = r; return r; };
    const attach = async (who: number, purpose: string, revision?: number) => {
      const form = new FormData(); form.append('version', String(row.version)); form.append('purpose', purpose); if (revision) form.append('revision', String(revision)); form.append('file', new Blob(['%PDF-1.7\nQuotation evidence'], { type: 'application/pdf' }), 'evidence.pdf');
      row = await request(who, `/${row.id}/attachments`, 'POST', form, 201); return row.attachments[0].id;
    };
    const doc = async (who: number, kind: string, evidenceId: string, quantity: string, fields: any = {}, expected = 201) => {
      const r = await request(who, `/${row.id}/documents`, 'POST', { version: row.version, kind, evidenceId, reference: kind + '-' + randomUUID(), date: new Date().toISOString(), items: [{ lineId: row.lines[0].id, quantity }], ...fields }, expected); if (expected === 201) row = r; return r;
    };
    await action(1, 'PREPARE', {}, 400); await attach(1, 'REQUEST');
    await action(1, 'SOURCE', { responsibleId: users[2].id, area: 'PURCHASING' });
    await action(3, 'COMMENT', { note: 'Intento de traspaso', responsibleId: users[3].id, area: 'WAREHOUSE' }, 403);
    const offerEvidence = await attach(2, 'SUPPLIER_QUOTE');
    await request(3, `/${row.id}/attachments/${offerEvidence}/download`, 'GET', undefined, 403);
    row = await request(2, `/${row.id}/offers`, 'POST', { version: row.version, lineId: row.lines[0].id, supplier: 'Proveedor', reference: 'OF-1', unitCost: '50', currency: 'COP', leadDays: 3, validUntil: '2099-12-31T23:59:59Z', evidenceId: offerEvidence }, 201);
    row = await request(2, `/${row.id}/offers/${row.offers[0].id}/select`, 'POST', { version: row.version }, 201);
    await action(2, 'PREPARE', { responsibleId: users[1].id, area: 'TECHNICAL' });
    const sentEvidence = await attach(1, 'CUSTOMER_QUOTE', 1);
    await action(1, 'SEND', { evidenceId: sentEvidence, validUntil: '2099-12-31T23:59:59Z', terms: 'Entrega en tres días', sentTo: 'contacto@cliente.invalid' });
    const firstRevision = JSON.stringify(row.revisions[0].snapshot);
    await request(1, `/${row.id}/lines`, 'PATCH', { version: row.version, lines: [lineInput] }, 409);
    await action(1, 'REVISE', { note: 'Cliente solicita nueva propuesta' });
    const v1 = row.version;
    row = await request(1, `/${row.id}/lines`, 'PATCH', { version: v1, lines: [{ ...lineInput, id: row.lines[0].id, unitPrice: '110.10' }] });
    await action(1, 'COMMENT', { version: v1, note: 'Cambio desactualizado' }, 409);
    assert.equal(JSON.stringify(row.revisions[0].snapshot), firstRevision);
    const quoteEvidence2 = await attach(1, 'CUSTOMER_QUOTE', 2);
    await action(1, 'SEND', { evidenceId: quoteEvidence2, validUntil: '2099-12-31T23:59:59Z', terms: 'Condiciones revisadas', sentTo: 'contacto@cliente.invalid' });
    const poEvidence = await attach(1, 'CUSTOMER_PO', 2), approval = { evidenceId: poEvidence, reference: 'OC-CLIENTE-1', note: 'Cliente, alcance, cantidades y valores verificados', items: [{ lineId: row.lines[0].id, quantity: '2' }], amount: '262.04', responsibleId: users[2].id, area: 'PURCHASING' };
    await action(1, 'APPROVE', { ...approval, amount: '262.05' }, 400); await action(1, 'APPROVE', approval);
    await action(1, 'CLOSE', {}, 409);
    const purchaseEvidence = await attach(2, 'SUPPLIER_PO');
    await doc(1, 'PURCHASE', purchaseEvidence, '2', {}, 403);
    await doc(2, 'PURCHASE', purchaseEvidence, '3', {}, 409);
    await doc(2, 'PURCHASE', purchaseEvidence, '2'); const purchaseId = row.documents.find((d: any) => d.kind === 'PURCHASE').id;
    await action(1, 'HANDOFF', { responsibleId: users[3].id, area: 'WAREHOUSE', note: 'Recibir compra' });
    const receiptEvidence = await attach(3, 'RECEIPT');
    await doc(3, 'RECEIPT', receiptEvidence, '1', { sourceDocumentId: purchaseId });
    assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: inv.id } })).qty, 1);
    const invoiceEvidence = await attach(4, 'INVOICE');
    await doc(4, 'INVOICE', invoiceEvidence, '2', { amount: '262.04' }, 409);
    await doc(4, 'INVOICE', invoiceEvidence, '1', { amount: '131.02' });
    const dispatchEvidence = await attach(5, 'DELIVERY');
    await doc(5, 'DELIVERY', dispatchEvidence, '1', {}, 409);
    await doc(5, 'DISPATCH', dispatchEvidence, '1'); await doc(5, 'DELIVERY', dispatchEvidence, '1');
    assert.equal(row.progress.complete, false); assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: inv.id } })).qty, 0);
    await doc(3, 'RECEIPT', receiptEvidence, '1', { sourceDocumentId: purchaseId });
    await doc(3, 'RECEIPT', receiptEvidence, '0.1', { sourceDocumentId: purchaseId }, 409);
    await doc(4, 'INVOICE', invoiceEvidence, '1', { amount: '131.02' });
    await doc(5, 'DISPATCH', dispatchEvidence, '1'); await doc(5, 'DELIVERY', dispatchEvidence, '1');
    assert.equal(row.progress.complete, true);
    const redacted = await request(3, '/' + row.id); assert.equal(redacted.offers.length, 0); assert.equal(redacted.documents.find((d: any) => d.kind === 'PURCHASE').items[0].unitCost, undefined); assert.equal(redacted.attachments.some((a: any) => a.purpose === 'SUPPLIER_QUOTE'), false);
    await action(1, 'CLOSE'); await action(1, 'HOLD', { note: 'Intento posterior al cierre' }, 409);
    console.log('PASS supplier quotation, immutable revisions, validated OC, partial purchase/receipt/invoice/dispatch/delivery and stock');
    const partCase = row;
    // Direct service path: completed OS and acceptance are mandatory before invoicing.
    row = await request(1, '', 'POST', { ...input, title: 'Servicio', lines: [{ ...lineInput, kind: 'SERVICE', route: 'SERVICE', inventoryItemId: undefined, quantity: '1', unitPrice: '200', taxPct: '0' }] }, 201);
    await attach(1, 'REQUEST'); await action(1, 'PREPARE'); const sq = await attach(1, 'CUSTOMER_QUOTE', 1);
    await action(1, 'SEND', { evidenceId: sq, validUntil: '2099-12-31T23:59:59Z', terms: 'Servicio', sentTo: 'Contacto' }); const sp = await attach(1, 'CUSTOMER_PO', 1);
    await action(1, 'APPROVE', { evidenceId: sp, reference: 'OC-SERV', note: 'Verificada', amount: '200', items: [{ lineId: row.lines[0].id, quantity: '1' }] });
    const os = await db.workOrder.create({ data: { tenantId: tenant.id, assetCode: 'EQ-1', title: 'Servicio vinculado', kind: 'SERVICE_ORDER', assignments: { create: { tenantId: tenant.id, userId: users[1].id } } } });
    row = await request(1, `/${row.id}/links`, 'POST', { version: row.version, lineId: row.lines[0].id, serviceOrderId: os.id }, 201);
    const serviceEvidence = await attach(1, 'SERVICE'); await doc(1, 'SERVICE', serviceEvidence, '1', {}, 409);
    await db.workOrder.update({ where: { id: os.id }, data: { status: 'COMPLETED' } }); await doc(1, 'SERVICE', serviceEvidence, '1');
    const si = await attach(4, 'INVOICE'); await doc(4, 'INVOICE', si, '1', { amount: '200' }); await action(1, 'CLOSE');
    console.log('PASS service route, OS linkage, completion/conformity and invoice');
    // Manufacturing receipts already entered stock in the existing module.
    row = await request(1, '', 'POST', { ...input, title: 'Fabricación', lines: [{ ...lineInput, route: 'MAKE', quantity: '1', unitPrice: '100', taxPct: '0' }] }, 201);
    await attach(1, 'REQUEST'); const me = await attach(2, 'SUPPLIER_QUOTE');
    row = await request(2, `/${row.id}/offers`, 'POST', { version: row.version, lineId: row.lines[0].id, supplier: 'Manufactura interna', reference: 'COSTO-1', unitCost: '50', currency: 'COP', leadDays: 1, validUntil: '2099-12-31T23:59:59Z', evidenceId: me }, 201);
    row = await request(2, `/${row.id}/offers/${row.offers[0].id}/select`, 'POST', { version: row.version }, 201);
    await action(1, 'PREPARE'); const mq = await attach(1, 'CUSTOMER_QUOTE', 1);
    await action(1, 'SEND', { evidenceId: mq, validUntil: '2099-12-31T23:59:59Z', terms: 'Fabricación', sentTo: 'Contacto' }); const mp = await attach(1, 'CUSTOMER_PO', 1);
    await action(1, 'APPROVE', { evidenceId: mp, reference: 'OC-MAKE', note: 'Verificada', amount: '100', items: [{ lineId: row.lines[0].id, quantity: '1' }] });
    const of = await db.manufacturingOrder.create({ data: { tenantId: tenant.id, number: 'OF-QUOTE-1', projectName: 'Repuesto comercial', productName: 'Pieza', orderType: 'SPARE_PART', outputInventoryItemId: inv.id, responsibleUserId: users[0].id, createdByUserId: users[0].id, quantity: 1, status: 'COMPLETED' } });
    row = await request(2, `/${row.id}/links`, 'POST', { version: row.version, lineId: row.lines[0].id, manufacturingOrderId: of.id }, 201);
    const productionEvidence = await attach(2, 'SUPPLIER_PO'); await doc(2, 'PRODUCTION', productionEvidence, '1'); const productionId = row.documents.find((d: any) => d.kind === 'PRODUCTION').id;
    const mr = await attach(3, 'RECEIPT'); await doc(3, 'RECEIPT', mr, '1', { sourceDocumentId: productionId }, 409);
    const stock = await db.inventoryStock.findFirstOrThrow({ where: { inventoryItemId: inv.id, tenantId: tenant.id } });
    await db.inventoryItem.update({ where: { id: inv.id }, data: { qty: 1 } }); await db.inventoryStock.update({ where: { id: stock.id }, data: { stockOnHand: 1 } });
    await db.manufacturingOutputReceipt.create({ data: { tenantId: tenant.id, manufacturingOrderId: of.id, inventoryItemId: inv.id, inventoryStockId: stock.id, quantity: '1', warehouseSnapshot: 'Principal', createdByUserId: users[0].id, createdByName: 'Admin' } });
    await doc(3, 'RECEIPT', mr, '1', { sourceDocumentId: productionId }); assert.equal((await db.inventoryItem.findUniqueOrThrow({ where: { id: inv.id } })).qty, 1);
    const mi = await attach(4, 'INVOICE'); await doc(4, 'INVOICE', mi, '1', { amount: '100' }); const md = await attach(5, 'DELIVERY'); await doc(5, 'DISPATCH', md, '1'); await doc(5, 'DELIVERY', md, '1'); await action(1, 'CLOSE');
    assert.equal(await db.inventoryMovement.count({ where: { tenantId: tenant.id, referenceType: 'QUOTATION_RECEIPT' } }), 2);
    console.log('PASS manufacturing linkage and received output without duplicate inventory entries');
    // Mixed request with a partial customer approval: only approved lines proceed.
    await db.inventoryItem.update({ where: { id: inv.id }, data: { qty: 1 } }); await db.inventoryStock.update({ where: { id: stock.id }, data: { stockOnHand: 1 } });
    row = await request(1, '', 'POST', { ...input, title: 'Mixta con aprobación parcial', lines: [{ ...lineInput, route: 'STOCK', unitPrice: '10' }, { kind: 'SERVICE', route: 'SERVICE', description: 'Instalación opcional', uom: 'SERV', quantity: '1', unitPrice: '20', taxPct: '0' }] }, 201);
    await attach(1, 'REQUEST'); await action(1, 'PREPARE'); const xq = await attach(1, 'CUSTOMER_QUOTE', 1);
    await action(1, 'SEND', { evidenceId: xq, validUntil: '2099-12-31T23:59:59Z', terms: 'Aprobación por línea', sentTo: 'Contacto' }); const xp = await attach(1, 'CUSTOMER_PO', 1);
    await action(1, 'APPROVE', { evidenceId: xp, reference: 'OC-MIXTA', note: 'Solo una unidad aprobada', amount: '11.90', items: [{ lineId: row.lines[0].id, quantity: '1' }] });
    assert.equal(Number(row.lines[1].approvedQty), 0); assert.equal(row.progress.service, 0);
    const xr = await attach(3, 'RECEIPT'); await doc(3, 'RECEIPT', xr, '1'); const xi = await attach(4, 'INVOICE'); await doc(4, 'INVOICE', xi, '1', { amount: '11.90' });
    const xd = await attach(5, 'DELIVERY'); await doc(5, 'DISPATCH', xd, '1'); await doc(5, 'DELIVERY', xd, '1'); await action(1, 'CLOSE');
    console.log('PASS mixed requests, partial approval and stock route');
    row = await request(1, '', 'POST', input, 201);
    const race = await Promise.all([1, 2].map(() => fetch(base + `/quotations/${row.id}/actions`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[1]}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: row.version, action: 'COMMENT', note: 'Concurrente' }) })));
    assert.deepEqual(race.map(r => r.status).sort(), [201, 409]); checks++;
    row = await request(1, '/' + row.id); await action(1, 'HOLD', { note: 'Espera de información' }); await action(1, 'SOURCE', {}, 409); await action(1, 'RESUME', { note: 'Información recibida' }); assert.equal(row.status, 'REQUESTED');
    await action(1, 'CANCEL', { note: 'Solicitud retirada' });
    await assert.rejects(db.quotationDocument.create({ data: { tenantId: other.id, quotationId: partCase.id, kind: 'INVOICE', reference: 'BAD', revision: 1, evidenceId: invoiceEvidence, date: new Date(), note: '', items: [], createdById: users[7].id } }));
    for (let n = 0; n < 35; n++) await db.quotationEvent.create({ data: { tenantId: tenant.id, quotationId: row.id, action: 'TEST', actorId: users[1].id, actorName: 'Test', note: '', details: {} } });
    assert.equal((await request(1, `/${row.id}/events`)).items.length, 30); assert.ok((await request(1, `/${row.id}/events?page=2`)).items.length > 0);
    assert.equal(await db.inventoryMovement.count({ where: { tenantId: tenant.id, referenceType: 'QUOTATION_RECEIPT' } }), 2);
    assert.equal(await db.inventoryMovement.count({ where: { tenantId: tenant.id, referenceType: 'QUOTATION_DISPATCH' } }), 4);
    console.log(`PASS tenant/role boundaries, private evidence, database constraints, concurrency, pause/cancel and complete history (${checks} HTTP checks)`);
  } finally {
    if (app) await app.close(); process.env.DATABASE_URL = previousDb; process.env.ATTACHMENTS_DIR = previousStorage;
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`); await admin.$disconnect(); await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
