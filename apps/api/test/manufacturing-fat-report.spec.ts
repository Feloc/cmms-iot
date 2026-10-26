import 'reflect-metadata';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import dns from 'node:dns/promises';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { storeFatMedia } from '../src/modules/manufacturing/manufacturing-fat-media';
import { ManufacturingFatService } from '../src/modules/manufacturing/manufacturing-fat.service';
import { ManufacturingFatController } from '../src/modules/manufacturing/manufacturing-fat.controller';
import { ManufacturingAccessGuard } from '../src/modules/manufacturing/manufacturing-access.guard';
import { ManufacturingValidationPipe } from '../src/modules/manufacturing/manufacturing-validation.pipe';
import { PrismaService } from '../src/prisma.service';
import { tenantStorage } from '../src/common/tenant-context';
import { fatReportHtml, fatReportPictures, renderFatPdf, selectFatReportCases, FatReportSnapshot } from '../src/modules/manufacturing/manufacturing-fat-report';
import { isPublicReportLogoAddress, manufacturingReportLogo } from '../src/modules/manufacturing/manufacturing-report-logo';

const logoPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const logoSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120" viewBox="0 0 360 120"><rect width="360" height="120" rx="12" fill="#173e68"/><text x="180" y="72" text-anchor="middle" font-family="Arial" font-size="32" fill="white">TENANT TEST</text></svg>');

const point = (patch: any = {}) => ({ id: 'point', position: 10, name: 'Inspección eléctrica', section: 'Eléctrica', acceptanceCriteria: 'Conforme al plano', result: 'PASS', resultType: 'BOOLEAN', required: true, evidenceRequired: false, evidence: [], deviations: [], ...patch });
export function reportFixture(): FatReportSnapshot {
  return { company: { name: 'Empresa de prueba', legalName: 'Fabricante de equipos', taxId: '900000000' }, order: { number: 'OM-TEST', projectName: 'Proyecto de prueba', productName: 'Máquina de ensamble', customerName: 'Cliente de prueba', model: 'M-100' }, generatedAt: new Date('2026-10-15T15:00:00Z'), generatedBy: 'Inspector', events: [{ entityId: 'execution', createdAt: new Date(), actorName: 'Revisor', summary: 'Excepción de independencia', afterData: { reason: 'Motivo de prueba explícito' } }], execution: { id: 'execution', executionCode: 'OM-TEST-U01-FAT-1', status: 'IN_PROGRESS', lockVersion: 7, templateCode: 'FAT-TEST', templateName: 'Prueba funcional', templateVersion: 1, manufacturedUnit: { unitNumber: 1, serialNumber: 'SERIE-001' }, assemblyExecution: { executionCode: 'ENS-001' }, approvals: [], cases: [point(), point({ id: 'child', parentCaseId: 'point', position: 11, name: 'Continuidad de tierra', resultType: 'NUMERIC', minimumValue: 0, maximumValue: 1, measuredValue: 0.5, unit: 'ohm', origin: 'EXECUTION', addedByName: 'Inspector', additionReason: 'Revisión complementaria necesaria', createdAt: new Date(), evidence: [{ id: 'video', title: 'Video funcional', storageKey: 'video-key', filename: 'prueba.mp4', mimeType: 'video/mp4', size: 2048, createdByName: 'Inspector' }], deviations: [{ id: 'finding', deviationCode: 'D01', title: 'Conductor sin etiqueta', description: 'Corregir identificación', kind: 'NON_CONFORMITY', severity: 'MINOR', status: 'ACCEPTED_AS_IS', resolutionNotes: 'Concesión autorizada para prototipo', evidence: [] }] }), point({ id: 'void', parentCaseId: 'point', position: 12, name: 'Revisión duplicada', result: 'PENDING', voidedAt: new Date(), voidedByName: 'Administrador', voidReason: 'Duplicada con otra revisión', origin: 'PROTOCOL' })] } };
}

test('FAT report preserves hierarchy, annulments, concessions, video references and current status', () => {
  const html = fatReportHtml(reportFixture());
  for (const text of ['REPORTE NO APROBADO', '10.1', '10.2', 'ANULADO', 'Concesión autorizada', 'prueba.mp4', 'Motivo de prueba explícito', '0 no conformidades abiertas bloqueantes', '1 subpuntos activos', '1 anulados']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('FAT APROBADO — aprobación registrada'));
  const approved = reportFixture(); approved.execution.status = 'APPROVED'; approved.execution.approvals = [{ decision: 'APPROVED', signedByName: 'Revisor independiente', signedByRole: 'ADMIN', signedAt: new Date() }];
  assert.ok(fatReportHtml(approved).includes('Revisor independiente'));
  assert.ok(fatReportHtml(approved).includes('FAT APROBADO — aprobación registrada'));
});

test('all report text is escaped and external resources are not embedded', () => {
  const s = reportFixture(); s.order.customerName = '<script>fetch("http://internal")</script>';
  s.execution.cases[0].notes = '<img src="file:///etc/passwd">';
  s.execution.cases[0].evidence = [{ id: 'external', title: 'Enlace externo', url: 'http://internal/private' }];
  const html = fatReportHtml(s);
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img src="file:'));
  assert.ok(!html.includes('src="http')); assert.ok(html.includes("default-src 'none'"));
});

test('tenant branding is embedded in complete and partial FAT headers without external logo URLs', async () => {
  const snapshot = reportFixture();
  snapshot.company.logoUrl = `data:image/png;base64,${logoPng.toString('base64')}`;
  const logo = await manufacturingReportLogo(snapshot.company.logoUrl);
  for (const s of [snapshot, selectFatReportCases(snapshot, ['point'])]) {
    const html = fatReportHtml(s, new Map(), logo);
    assert.ok(html.includes(`<img class="brand-logo" src="${snapshot.company.logoUrl}"`));
    assert.ok(html.includes('Logo de Fabricante de equipos'));
    assert.ok(html.includes('NIT 900000000'));
    assert.ok(html.includes('max-height:68px'));
    assert.ok(!html.includes('src="http'));
  }
  assert.deepEqual(await manufacturingReportLogo(null), {});
  assert.deepEqual(await manufacturingReportLogo('  '), {});
  assert.ok(!fatReportHtml(snapshot).includes('<img class="brand-logo"'));
  const failed = await manufacturingReportLogo('file:///etc/passwd');
  const html = fatReportHtml(snapshot, new Map(), failed);
  assert.ok(html.includes('Logo del tenant no disponible'));
  assert.ok(html.includes('Reporte de pruebas FAT'));
  assert.ok(!html.includes('file:///'));
});

test('report logos accept image content, including SVG, and reject malformed or oversized data', async () => {
  assert.equal((await manufacturingReportLogo(`data:image/svg+xml;base64,${logoSvg.toString('base64')}`)).src, `data:image/svg+xml;base64,${logoSvg.toString('base64')}`);
  for (const value of ['data:text/html;base64,PHNjcmlwdD4=', 'data:image/png;base64,PHNjcmlwdD4=', 'data:image/png;base64,%%%INVALID', `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}`]) {
    const logo = await manufacturingReportLogo(value);
    assert.equal(logo.src, undefined); assert.ok(logo.warning);
  }
});

test('logo downloads exclude internal, loopback, link-local, mapped and reserved IP addresses', async () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.1.1', '192.168.1.1', '192.0.2.1', '198.18.0.1', '224.0.0.1', '255.255.255.255', '::', '::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8', 'fc00::1', 'fe80::1', '2001:db8::1', '2002:7f00:1::', 'not-an-address']) assert.equal(isPublicReportLogoAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicReportLogoAddress(address), true, address);
  for (const url of ['http://127.0.0.1/logo.png', 'http://169.254.169.254/logo.png', 'http://[::1]/logo.png', 'ftp://example.com/logo.png', 'https://user:password@example.com/logo.png']) assert.ok((await manufacturingReportLogo(url)).warning, url);
});

test('public branding images use pinned DNS, bounded downloads and revalidated redirects without credentials', async () => {
  const calls: any[] = [];
  let mode = 'ok';
  const resolver = mock.method(dns, 'lookup', async (hostname: string) => hostname === 'private.example' ? [{ address: '10.0.0.1', family: 4 }] : hostname === 'mixed.example' ? [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }] : [{ address: '8.8.8.8', family: 4 }]);
  const client = mock.method(https, 'get', ((url: URL, options: any, callback: any) => {
    calls.push({ url: url.href, options });
    options.lookup(url.hostname, {}, (_error: unknown, address: string, family: number) => { assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
    const request = new EventEmitter();
    queueMicrotask(() => {
      if (mode === 'network-error') { request.emit('error', new Error('Synthetic network failure')); return; }
      const redirect = mode === 'redirect' || mode === 'private-redirect' || mode === 'loop';
      const response = Readable.from(mode === 'oversized' ? [Buffer.alloc(2 * 1024 * 1024 + 1)] : mode === 'invalid-content' ? [Buffer.from('<html>not an image</html>')] : [logoPng.subarray(0, 20), logoPng.subarray(20)]) as any;
      response.statusCode = redirect ? 302 : mode === 'missing' ? 404 : 200;
      response.headers = { 'content-type': mode === 'html' ? 'text/html' : 'image/png', ...(mode === 'large-header' ? { 'content-length': 3 * 1024 * 1024 } : {}), ...(redirect ? { location: mode === 'private-redirect' ? 'https://private.example/logo.png' : mode === 'loop' ? '/again' : '/brand.png' } : {}) };
      if (mode === 'redirect') mode = 'ok';
      callback(response);
    });
    return request;
  }) as any);
  try {
    assert.equal((await manufacturingReportLogo('https://brand.example/logo.png')).src, `data:image/png;base64,${logoPng.toString('base64')}`);
    assert.equal(calls[0].options.agent, false);
    assert.equal(calls[0].options.headers.Authorization, undefined);
    assert.equal(calls[0].options.headers.Cookie, undefined);
    mode = 'redirect';
    assert.ok((await manufacturingReportLogo('https://brand.example/logo.png')).src);
    assert.equal(calls.at(-1).url, 'https://brand.example/brand.png');
    for (const value of ['private-redirect', 'oversized', 'large-header', 'invalid-content', 'html', 'missing', 'network-error', 'loop']) {
      mode = value; const before = calls.length;
      const logo = await manufacturingReportLogo('https://brand.example/logo.png');
      assert.equal(logo.src, undefined, value); assert.ok(logo.warning, value);
      if (value === 'private-redirect') assert.equal(calls.length - before, 1);
      if (value === 'loop') assert.equal(calls.length - before, 4);
    }
    const before = calls.length;
    assert.ok((await manufacturingReportLogo('https://mixed.example/logo.png')).warning);
    assert.equal(calls.length, before);
  } finally { client.mock.restore(); resolver.mock.restore(); }
});

test('selected FAT points omit unselected details, evidence and audit without changing the execution', () => {
  const snapshot = reportFixture();
  snapshot.events.push({ entityId: 'child', summary: 'Trazabilidad excluida', afterData: { notes: 'Nota excluida' } });
  const selected = selectFatReportCases(snapshot, ['point', 'point']);
  assert.deepEqual(selected.selectedCaseIds, ['point']);
  assert.equal(selected.execution, snapshot.execution);
  assert.equal(snapshot.execution.cases.length, 3);
  assert.equal(snapshot.selectedCaseIds, undefined);
  const html = fatReportHtml(selected);
  for (const text of ['Inspección eléctrica', 'REPORTE PARCIAL', '1 de 3 verificaciones incluidas', 'Resumen de verificaciones incluidas', 'REPORTE NO APROBADO']) assert.ok(html.includes(text), text);
  for (const text of ['Continuidad de tierra', 'Revisión duplicada', 'prueba.mp4', 'Conductor sin etiqueta', 'Trazabilidad excluida', 'Nota excluida']) assert.ok(!html.includes(text), text);
});

test('subpoint selection includes its parent, preserves original numbering and excludes siblings', () => {
  const snapshot = reportFixture();
  const selected = selectFatReportCases(snapshot, ['void']);
  assert.deepEqual(new Set(selected.selectedCaseIds), new Set(['void', 'point']));
  const html = fatReportHtml(selected);
  for (const text of ['Inspección eléctrica', 'Revisión duplicada', '10.2', 'ANULADO']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('Continuidad de tierra'));
  assert.ok(!html.includes('10.1'));
  assert.ok(!fatReportHtml(selectFatReportCases(snapshot, ['point', 'child', 'void'])).includes('REPORTE PARCIAL'));
  assert.equal(selectFatReportCases(snapshot), snapshot);
});

test('partial reports retain global blockers, actual approval state and approval scope', () => {
  const snapshot = reportFixture();
  snapshot.execution.cases[1].result = 'FAIL';
  snapshot.execution.cases[1].deviations[0].status = 'OPEN';
  const html = fatReportHtml(selectFatReportCases(snapshot, ['point']));
  assert.ok(html.includes('Estado global: 1 no conformes'));
  assert.ok(html.includes('1 no conformidades abiertas bloqueantes en toda la ejecución'));
  assert.ok(html.includes('REPORTE NO APROBADO'));
  assert.ok(!html.includes('Conductor sin etiqueta'));
  snapshot.execution.status = 'APPROVED';
  snapshot.execution.approvals = [{ decision: 'APPROVED', signedByName: 'Revisor', signedByRole: 'ADMIN', signedAt: new Date() }];
  const approved = fatReportHtml(selectFatReportCases(snapshot, ['point']));
  assert.ok(approved.includes('FAT APROBADO — aprobación registrada'));
  assert.ok(approved.includes('Estas aprobaciones corresponden a la ejecución FAT completa'));
  assert.ok(approved.includes('REPORTE PARCIAL'));
});

test('report selection rejects empty, oversized, malformed and foreign case IDs', () => {
  for (const ids of [[], Array(1001).fill('point'), null, 'point', [10], [''], ['foreign'], ['point', 'foreign']]) {
    assert.throws(() => selectFatReportCases(reportFixture(), ids), /Selecciona|no pertenecen/);
  }
});

test('excluded point and finding photos are not read or embedded', async () => {
  const snapshot = reportFixture();
  const image = { id: 'excluded-image', mimeType: 'image/png', storageKey: '00000000-0000-0000-0000-000000000000.png', size: 5 };
  snapshot.execution.cases[1].evidence = [image];
  snapshot.execution.cases[1].deviations[0].evidence = [{ ...image, id: 'excluded-finding-image' }];
  assert.equal((await fatReportPictures(selectFatReportCases(snapshot, ['point']))).size, 0);
});

test('missing or oversized photos retain explicit evidence warnings', async () => {
  const s = reportFixture(); s.execution.cases[0].evidence = [{ id: 'missing', mimeType: 'image/png', storageKey: '00000000-0000-0000-0000-000000000000.png', size: 5 }, { id: 'large', mimeType: 'image/png', storageKey: 'large', size: 21 * 1024 * 1024 }];
  const pictures = await fatReportPictures(s);
  assert.match(pictures.get('missing')!.warning!, /no disponible/); assert.match(pictures.get('large')!.warning!, /límite/);
});

test('Chromium generates a real multipage FAT PDF with long Unicode content', async () => {
  const s = reportFixture(); s.execution.cases[0].notes = 'Verificación eléctrica: tensión, conexión y protección. '.repeat(160);
  const logo = await manufacturingReportLogo(`data:image/svg+xml;base64,${logoSvg.toString('base64')}`);
  const html = fatReportHtml(s, new Map(), logo); const pdf = await renderFatPdf(html);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.length > 10000);
  assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= 2);
  if (process.env.FAT_REPORT_TEST_DIR) { await fs.writeFile(join(process.env.FAT_REPORT_TEST_DIR, 'fat-preview.html'), html); await fs.writeFile(join(process.env.FAT_REPORT_TEST_DIR, 'fat-preview.pdf'), pdf); }
});

test('local photographs are embedded from isolated storage, including finding evidence', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'fat-report-images-'));
  const previous = process.env.ATTACHMENTS_DIR;
  process.env.ATTACHMENTS_DIR = directory;
  try {
    const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    const metadata = await storeFatMedia({ originalname: 'foto.png', mimetype: 'image/png', buffer });
    const s = reportFixture(); s.execution.cases[1].deviations[0].evidence = [{ id: 'photo', title: 'Foto de novedad', ...metadata }];
    const pictures = await fatReportPictures(s);
    assert.equal(pictures.get('photo')?.src, `data:image/png;base64,${buffer.toString('base64')}`);
    assert.ok(fatReportHtml(s, pictures).includes('<img src="data:image/png;base64,'));
  } finally {
    if (previous === undefined) delete process.env.ATTACHMENTS_DIR; else process.env.ATTACHMENTS_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('report snapshot enforces tenant and order visibility before loading report details', async () => {
  const snapshot = reportFixture(); let actorTenant = 'tenant-a'; let role = 'TECH'; let member = false; let details = 0;
  const tx: any = {
    user: { findFirst: async ({ where }: any) => where.tenantId === actorTenant ? { id: 'user', name: 'Inspector', role } : null },
    manufacturingFatExecution: { findFirst: async ({ where }: any) => where.tenantId === 'tenant-a' ? { ...snapshot.execution, manufacturingOrderId: 'order' } : null },
    manufacturingOrder: { findFirst: async () => ({ ...snapshot.order, id: 'order', responsibleUserId: 'other', members: member ? [{ userId: 'user' }] : [] }) },
    tenant: { findUnique: async ({ where, select }: any) => { assert.equal(where.id, 'tenant-a'); assert.equal(select.logoUrl, true); details++; return { ...snapshot.company, logoUrl: 'https://brand.example/logo.png' }; } },
    manufacturingAuditEvent: { findMany: async () => snapshot.events },
  };
  const service = new ManufacturingFatService({ $transaction: async (fn: any) => fn(tx) } as any);
  const read = (tenantId: string) => tenantStorage.run({ tenantId, userId: 'user' }, () => service.reportSnapshot('execution'));
  await assert.rejects(read('tenant-a'), /no encontrada/); assert.equal(details, 0);
  member = true; const permitted = await read('tenant-a'); assert.equal(permitted.order.id, 'order'); assert.equal(permitted.company.logoUrl, 'https://brand.example/logo.png');
  actorTenant = 'tenant-b'; role = 'ADMIN'; await assert.rejects(read('tenant-b'), /no encontrada/);
  assert.equal(details, 1);
});

test('selected report HTTP export validates its body and preserves read-only access without allowing writes', async () => {
  let reports = 0; let writes = 0;
  const db = { user: { findFirst: async () => ({ role: tenantStorage.getStore()?.userId }) }, manufacturingFatExecution: { findFirst: async () => null } };
  class TestModule {}
  Module({ controllers: [ManufacturingFatController], providers: [
    { provide: PrismaService, useValue: db },
    { provide: ManufacturingFatService, useValue: {
      reportPdf: async (_id: string, ids?: string[]) => { selectFatReportCases(reportFixture(), ids); reports++; return { buffer: Buffer.from('%PDF-test'), filename: 'FAT-test-parcial.pdf' }; },
      start: async () => { writes++; return []; },
    } },
    ManufacturingAccessGuard, ManufacturingValidationPipe,
  ] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.use((req: any, _res: any, next: () => void) => tenantStorage.run({ tenantId: 'test', userId: req.headers['x-test-role'] || 'ADMIN' }, next));
  try {
    await app.listen(0, '127.0.0.1');
    const url = `${await app.getUrl()}/manufacturing/fat-executions/execution`;
    const post = (suffix: string, body: unknown, role = 'VIEWER') => fetch(`${url}/${suffix}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-role': role }, body: JSON.stringify(body) });
    for (const role of ['ADMIN', 'TECH', 'VIEWER']) {
      const response = await post('report.pdf', { caseIds: ['child'] }, role);
      assert.equal(response.status, 200, role);
      assert.equal(response.headers.get('content-type'), 'application/pdf');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.match(response.headers.get('content-disposition')!, /parcial\.pdf/);
      assert.equal(await response.text(), '%PDF-test');
    }
    for (const body of [{}, { caseIds: [] }, { caseIds: ['foreign'] }, { caseIds: [12] }, { caseIds: ['point'], tenantId: 'foreign' }, { caseIds: Array(1001).fill('point') }]) assert.equal((await post('report.pdf', body)).status, 400);
    assert.equal(reports, 3);
    assert.equal((await post('start', { lockVersion: 1 })).status, 403);
    assert.equal((await post('start', { lockVersion: 1 }, 'TECH')).status, 404);
    assert.equal(writes, 0);
    const complete = await fetch(`${url}/report.pdf`);
    assert.equal(complete.status, 200);
    assert.equal(reports, 4);
  } finally { await app.close(); }
});
