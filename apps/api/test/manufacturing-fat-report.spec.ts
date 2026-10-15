import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { storeFatMedia } from '../src/modules/manufacturing/manufacturing-fat-media';
import { ManufacturingFatService } from '../src/modules/manufacturing/manufacturing-fat.service';
import { tenantStorage } from '../src/common/tenant-context';
import { fatReportHtml, fatReportPictures, renderFatPdf, FatReportSnapshot } from '../src/modules/manufacturing/manufacturing-fat-report';

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

test('missing or oversized photos retain explicit evidence warnings', async () => {
  const s = reportFixture(); s.execution.cases[0].evidence = [{ id: 'missing', mimeType: 'image/png', storageKey: '00000000-0000-0000-0000-000000000000.png', size: 5 }, { id: 'large', mimeType: 'image/png', storageKey: 'large', size: 21 * 1024 * 1024 }];
  const pictures = await fatReportPictures(s);
  assert.match(pictures.get('missing')!.warning!, /no disponible/); assert.match(pictures.get('large')!.warning!, /límite/);
});

test('Chromium generates a real multipage FAT PDF with long Unicode content', async () => {
  const s = reportFixture(); s.execution.cases[0].notes = 'Verificación eléctrica: tensión, conexión y protección. '.repeat(160);
  const html = fatReportHtml(s); const pdf = await renderFatPdf(html);
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
    tenant: { findUnique: async () => { details++; return snapshot.company; } },
    manufacturingAuditEvent: { findMany: async () => snapshot.events },
  };
  const service = new ManufacturingFatService({ $transaction: async (fn: any) => fn(tx) } as any);
  const read = (tenantId: string) => tenantStorage.run({ tenantId, userId: 'user' }, () => service.reportSnapshot('execution'));
  await assert.rejects(read('tenant-a'), /no encontrada/); assert.equal(details, 0);
  member = true; assert.equal((await read('tenant-a')).order.id, 'order');
  actorTenant = 'tenant-b'; role = 'ADMIN'; await assert.rejects(read('tenant-b'), /no encontrada/);
  assert.equal(details, 1);
});
