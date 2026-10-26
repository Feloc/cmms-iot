import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ManufacturingDispatchController } from '../src/modules/manufacturing/manufacturing-dispatch.controller';
import { ManufacturingDispatchService } from '../src/modules/manufacturing/manufacturing-dispatch.service';
import { DISPATCH_DOCUMENT_MAX_BYTES, dispatchDocumentPath, validateDispatchDocument } from '../src/modules/manufacturing/manufacturing-dispatch-files';
import { ManufacturingAccessGuard } from '../src/modules/manufacturing/manufacturing-access.guard';
import { ManufacturingValidationPipe } from '../src/modules/manufacturing/manufacturing-validation.pipe';
import { PrismaService } from '../src/prisma.service';
import { tenantStorage } from '../src/common/tenant-context';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const file = { originalname: 'certificación.pdf', mimetype: 'application/pdf', buffer: pdf };
const dto = { documentType: 'CERTIFICATE' as const, title: 'Certificación del equipo' };

// All writes use an in-memory transaction and an isolated attachment directory.
// There is deliberately no database connection in this suite.
function setup() {
  const actors: Record<string, any> = {
    admin: { id: 'admin', name: 'Administradora', role: 'ADMIN' },
    tech: { id: 'tech', name: 'Responsable', role: 'TECH' },
    observer: { id: 'observer', name: 'Observador', role: 'TECH' },
    outsider: { id: 'outsider', name: 'Sin acceso', role: 'TECH' },
    viewer: { id: 'viewer', name: 'Consulta', role: 'VIEWER' },
  };
  const order: any = { id: 'order', tenantId: 'tenant', status: 'RELEASED', responsibleUserId: 'tech', members: [{ userId: 'observer', function: 'OBSERVER' }] };
  const dispatch: any = { id: 'dispatch', tenantId: 'tenant', manufacturingOrderId: order.id, dispatchCode: 'MO-1-DSP', status: 'PREPARING' };
  let documents = new Map<string, any>();
  let sequence = 0;
  let failCommit = false;
  let failAudit = false;
  let failList = false;
  const queryOrder = (args: any) => ({ ...order, members: order.members.filter((member: any) => member.userId === args?.include?.members?.where?.userId) });
  const tx: any = {
    $queryRaw: async () => [],
    user: { findFirst: async ({ where }: any) => where.tenantId === 'tenant' ? actors[where.id] || null : null },
    manufacturingOrder: { findFirst: async (args: any) => args.where.tenantId === 'tenant' && args.where.id === order.id ? queryOrder(args) : null },
    manufacturingDispatch: { findFirst: async (args: any) => {
      if (args.where.tenantId !== 'tenant' || args.where.id !== dispatch.id) return null;
      // The HTTP guard resolves operative access before invoking the service.
      if (args.select?.id) {
        const userId = tenantStorage.getStore()?.userId;
        return order.responsibleUserId === userId || order.members.some((member: any) => member.userId === userId && member.function !== 'OBSERVER') ? { id: dispatch.id } : null;
      }
      return { ...dispatch, manufacturingOrder: queryOrder(args.include.manufacturingOrder) };
    } },
    manufacturingDispatchDocument: {
      create: async ({ data }: any) => { const row = { ...data, id: `document-${++sequence}` }; documents.set(row.id, row); return row; },
      findFirst: async ({ where }: any) => {
        const row = documents.get(where.id);
        return row?.tenantId === where.tenantId ? { ...row, dispatch: { manufacturingOrderId: order.id } } : null;
      },
      delete: async ({ where }: any) => { const row = documents.get(where.id); documents.delete(where.id); return row; },
    },
    manufacturingAuditEvent: { create: async () => { if (failAudit) throw new Error('Audit failure'); return {}; } },
  };
  const prisma: any = { ...tx, $transaction: async (callback: any) => {
    const before = new Map(documents);
    try { const result = await callback(tx); if (failCommit) throw new Error('Commit failure'); return result; }
    catch (error) { documents = before; throw error; }
  } };
  const service = new ManufacturingDispatchService(prisma);
  service.list = async () => { if (failList) throw new Error('Response failure'); return []; };
  return {
    service, prisma, order, dispatch,
    documents: () => [...documents.values()],
    run: (callback: () => Promise<any>, userId = 'admin', tenantId = 'tenant') => tenantStorage.run({ tenantId, userId }, callback),
    failCommit: (value: boolean) => { failCommit = value; },
    failAudit: (value: boolean) => { failAudit = value; },
    failList: (value: boolean) => { failList = value; },
  };
}

async function withStorage(callback: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(join(tmpdir(), 'dispatch-documents-test-'));
  const previous = process.env.ATTACHMENTS_DIR;
  process.env.ATTACHMENTS_DIR = root;
  try { await callback(root); }
  finally {
    await fs.rm(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.ATTACHMENTS_DIR;
    else process.env.ATTACHMENTS_DIR = previous;
  }
}

async function attachmentFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => entry.isDirectory() ? attachmentFiles(join(root, entry.name)) : [join(root, entry.name)]));
  return nested.flat();
}

test('dispatch documents validate file formats, size, private paths and safe original names', () => {
  assert.equal(validateDispatchDocument(file).mimeType, 'application/pdf');
  assert.throws(() => validateDispatchDocument(), /Selecciona|archivo/i);
  assert.throws(() => validateDispatchDocument({ ...file, originalname: 'malware.exe' }), /formato|permitido|extensión/i);
  assert.throws(() => validateDispatchDocument({ ...file, buffer: Buffer.from('<html>not a PDF</html>') }), /formato|contenido|PDF/i);
  assert.throws(() => validateDispatchDocument({ ...file, buffer: Buffer.alloc(DISPATCH_DOCUMENT_MAX_BYTES + 1) }), /20 MB/);
  assert.throws(() => dispatchDocumentPath('../../outside.pdf'), /inválido/i);
  assert.doesNotMatch(validateDispatchDocument({ ...file, originalname: '../../certificado\r\n.pdf' }).filename, /[\/\\\r\n]/);
});

test('a document persists its private file, supports authorized download and removes bytes after commit', async () => {
  await withStorage(async root => {
    const s = setup();
    await s.run(() => s.service.uploadDocument('dispatch', { ...dto, reference: 'CERT-123', notes: 'Original firmado' }, file), 'tech');
    const [document] = s.documents();
    assert.equal(document.title, dto.title);
    assert.equal(document.reference, 'CERT-123');
    assert.equal(document.createdByUserId, 'tech');
    assert.equal(document.filename, file.originalname);
    assert.equal(document.mimeType, 'application/pdf');
    assert.equal(document.size, pdf.length);
    assert.notEqual(document.storageKey, file.originalname);
    const location = dispatchDocumentPath(document.storageKey);
    assert.deepEqual(await fs.readFile(location), pdf);
    assert.equal((await fs.stat(location)).mode & 0o777, 0o600);
    const download = await s.run(() => s.service.documentFile(document.id), 'viewer');
    assert.deepEqual(download, { path: location, filename: file.originalname, mimeType: 'application/pdf', size: pdf.length });
    await s.run(() => s.service.documentFile(document.id), 'observer');
    await assert.rejects(s.run(() => s.service.documentFile(document.id), 'outsider'), /no encontrada/i);
    await assert.rejects(s.run(() => s.service.documentFile(document.id), 'admin', 'other-tenant'), /no encontrado/i);

    // A transaction that does not commit must keep both the row and the file.
    s.failCommit(true);
    await assert.rejects(s.run(() => s.service.removeDocument(document.id)), /Commit failure/);
    assert.equal(s.documents().length, 1);
    assert.deepEqual(await fs.readFile(location), pdf);
    s.failCommit(false);
    await s.run(() => s.service.removeDocument(document.id));
    assert.equal(s.documents().length, 0);
    assert.deepEqual(await attachmentFiles(root), []);
  });
});

test('failed creation removes uncommitted files while response failure preserves committed documents', async () => {
  await withStorage(async root => {
    const s = setup();
    s.failAudit(true);
    await assert.rejects(s.run(() => s.service.uploadDocument('dispatch', dto, file)), /Audit failure/);
    assert.deepEqual(s.documents(), []);
    assert.deepEqual(await attachmentFiles(root), []);
    s.failAudit(false); s.failCommit(true);
    await assert.rejects(s.run(() => s.service.uploadDocument('dispatch', dto, file)), /Commit failure/);
    assert.deepEqual(s.documents(), []);
    assert.deepEqual(await attachmentFiles(root), []);
    s.failCommit(false); s.failList(true);
    await assert.rejects(s.run(() => s.service.uploadDocument('dispatch', dto, file)), /Response failure/);
    assert.equal(s.documents().length, 1);
    assert.equal((await attachmentFiles(root)).length, 1);
  });
});

test('document writes respect order access and preparation states without leaving files on rejection', async () => {
  await withStorage(async root => {
    const s = setup();
    for (const userId of ['viewer', 'observer', 'outsider']) {
      await assert.rejects(s.run(() => s.service.uploadDocument('dispatch', dto, file), userId), /operativa|no encontrado/i);
    }
    for (const status of ['ON_HOLD', 'CANCELED', 'COMPLETED']) {
      s.order.status = status;
      await assert.rejects(s.run(() => s.service.uploadDocument('dispatch', dto, file)), /orden no permite/i);
    }
    s.order.status = 'RELEASED';
    for (const status of ['DRAFT', 'DISPATCHED', 'DELIVERED', 'CANCELED']) {
      s.dispatch.status = status;
      await assert.rejects(s.run(() => s.service.uploadDocument('dispatch', dto, file)), /no admite cambios/i);
    }
    s.dispatch.status = 'PREPARING';
    await assert.rejects(s.run(() => s.service.uploadDocument('dispatch', { ...dto, documentType: 'INVALID' as any }, file)), /Tipo de documento/i);
    await assert.rejects(s.run(() => s.service.uploadDocument('dispatch', { ...dto, title: ' ' }, file)), /título/i);
    assert.deepEqual(s.documents(), []);
    assert.deepEqual(await attachmentFiles(root), []);
    for (const status of ['PREPARING', 'READY', 'AUTHORIZED']) {
      s.dispatch.status = status;
      await s.run(() => s.service.uploadDocument('dispatch', dto, file));
    }
    assert.equal(s.documents().length, 3);
    const document = s.documents()[0];
    await assert.rejects(s.run(() => s.service.removeDocument(document.id), 'observer'), /operativa/i);
    s.dispatch.status = 'DISPATCHED';
    await assert.rejects(s.run(() => s.service.removeDocument(document.id)), /no admite cambios/i);
    assert.equal((await attachmentFiles(root)).length, 3);
  });
});

test('reference-only documents remain supported and unavailable files return a controlled error', async () => {
  await withStorage(async root => {
    const s = setup();
    await s.run(() => s.service.addDocument('dispatch', { ...dto, reference: 'Documento físico CERT-10' }));
    const referenceOnly = s.documents()[0];
    assert.equal(referenceOnly.storageKey, undefined);
    await assert.rejects(s.run(() => s.service.documentFile(referenceOnly.id)), /Archivo no encontrado/i);
    assert.deepEqual(await attachmentFiles(root), []);
    await assert.rejects(s.run(() => s.service.addDocument('dispatch', dto)), /archivo, referencia/i);
    await s.run(() => s.service.uploadDocument('dispatch', dto, file));
    const attached = s.documents()[1];
    await fs.writeFile(dispatchDocumentPath(attached.storageKey), Buffer.from('truncated'));
    await assert.rejects(s.run(() => s.service.documentFile(attached.id)), /no disponible/i);
    await fs.unlink(dispatchDocumentPath(attached.storageKey));
    await assert.rejects(s.run(() => s.service.documentFile(attached.id)), /no disponible/i);
  });
});

test('multipart contract enforces roles, fields, one file, size and authenticated attachment download', async () => {
  await withStorage(async () => {
    const s = setup();
    class TestModule {}
    Module({ controllers: [ManufacturingDispatchController], providers: [
      { provide: PrismaService, useValue: s.prisma },
      { provide: ManufacturingDispatchService, useValue: s.service },
      ManufacturingAccessGuard, ManufacturingValidationPipe,
    ] })(TestModule);
    const app = await NestFactory.create(TestModule, { logger: false });
    app.use((request: any, _response: any, next: () => void) => tenantStorage.run({ tenantId: request.headers['x-test-tenant'] || 'tenant', userId: request.headers['x-test-user'] || 'admin' }, next));
    try {
      await app.listen(0, '127.0.0.1');
      const base = `${await app.getUrl()}/manufacturing`;
      const post = (options: { user?: string; count?: number; extra?: string; bytes?: Buffer; filename?: string; title?: string } = {}) => {
        const body = new FormData(); body.append('documentType', dto.documentType); body.append('title', options.title ?? dto.title);
        if (options.extra) body.append(options.extra, 'injected');
        for (let index = 0; index < (options.count ?? 1); index++) body.append('file', new Blob([new Uint8Array(options.bytes ?? pdf)], { type: 'application/pdf' }), options.filename ?? file.originalname);
        return fetch(`${base}/dispatches/dispatch/documents/file`, { method: 'POST', headers: { 'x-test-user': options.user ?? 'admin' }, body });
      };
      assert.equal((await post({ user: 'viewer' })).status, 403);
      assert.equal((await post({ user: 'observer' })).status, 404);
      assert.equal((await post({ extra: 'storageKey' })).status, 400);
      assert.equal((await post({ count: 0 })).status, 400);
      assert.equal((await post({ count: 2 })).status, 400);
      assert.equal((await post({ title: '' })).status, 400);
      assert.equal((await post({ filename: 'program.exe' })).status, 400);
      assert.equal((await post({ bytes: Buffer.alloc(DISPATCH_DOCUMENT_MAX_BYTES + 1) })).status, 413);
      assert.equal(s.documents().length, 0);
      assert.equal((await post({ user: 'tech' })).status, 201);
      const [document] = s.documents();
      const download = await fetch(`${base}/dispatch-documents/${document.id}/file`, { headers: { 'x-test-user': 'viewer' } });
      assert.equal(download.status, 200);
      assert.equal(download.headers.get('content-type'), 'application/pdf');
      assert.equal(download.headers.get('content-length'), String(pdf.length));
      assert.equal(download.headers.get('cache-control'), 'private, no-store');
      assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
      assert.match(download.headers.get('content-disposition')!, /^attachment;.*certificaci%C3%B3n.pdf/);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
      assert.equal((await fetch(`${base}/dispatch-documents/${document.id}/file`, { headers: { 'x-test-user': 'outsider' } })).status, 404);
      assert.equal((await fetch(`${base}/dispatch-documents/${document.id}/file`, { headers: { 'x-test-tenant': 'other-tenant' } })).status, 403);
      assert.equal((await fetch(`${base}/dispatch-documents/missing/file`)).status, 404);
      const reference = await fetch(`${base}/dispatches/dispatch/documents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...dto, reference: 'Guía física' }) });
      assert.equal(reference.status, 201);
      assert.equal(s.documents().length, 2);
    } finally { await app.close(); }
  });
});
