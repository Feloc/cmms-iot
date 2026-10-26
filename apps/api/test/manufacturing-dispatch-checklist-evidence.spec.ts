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
import { DISPATCH_DOCUMENT_MAX_BYTES, dispatchDocumentPath } from '../src/modules/manufacturing/manufacturing-dispatch-files';
import { ManufacturingAccessGuard } from '../src/modules/manufacturing/manufacturing-access.guard';
import { ManufacturingValidationPipe } from '../src/modules/manufacturing/manufacturing-validation.pipe';
import { PrismaService } from '../src/prisma.service';
import { tenantStorage } from '../src/common/tenant-context';
import { dispatchJpeg } from './fixtures/dispatch-jpeg';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1cAAAAASUVORK5CYII=', 'base64');
const file = { originalname: 'inspección.pdf', mimetype: 'application/pdf', buffer: pdf };
const photo = { originalname: 'anclaje.png', mimetype: 'image/png', buffer: png };
const dto = { title: 'Protecciones y fijación' };

// These tests use only an in-memory transaction and a private temporary directory.
// Rollback restores the model state; it deliberately cannot hide orphaned files.
function setup() {
  const actors: Record<string, any> = {
    admin: { id: 'admin', name: 'Administradora', role: 'ADMIN' },
    tech: { id: 'tech', name: 'Responsable', role: 'TECH' },
    operative: { id: 'operative', name: 'Embalaje', role: 'TECH' },
    observer: { id: 'observer', name: 'Observador', role: 'TECH' },
    outsider: { id: 'outsider', name: 'Sin acceso', role: 'TECH' },
    viewer: { id: 'viewer', name: 'Consulta', role: 'VIEWER' },
  };
  const order: any = { id: 'order', tenantId: 'tenant', status: 'RELEASED', version: 1, responsibleUserId: 'tech', members: [{ userId: 'observer', function: 'OBSERVER' }, { userId: 'operative', function: 'ASSEMBLY' }] };
  const dispatch: any = { id: 'dispatch', tenantId: 'tenant', manufacturingOrderId: order.id, dispatchCode: 'MO-1-DSP', status: 'PREPARING', lockVersion: 1, destination: 'Cliente', deliveryAddress: 'Planta principal', carrierName: 'Transportes', manufacturedUnit: { serialNumber: 'SN-1' }, packages: [{ id: 'package' }], documents: [{ id: 'packing', documentType: 'PACKING_LIST' }] };
  let items = new Map<string, any>([['item', { id: 'item', tenantId: 'tenant', dispatchId: dispatch.id, name: 'Identificación y serial', status: 'PENDING', required: true, evidenceRequired: true, evidenceReference: null, notes: null, lockVersion: 1, completedAt: null, completedByUserId: null, completedByName: null }]]);
  let evidence = new Map<string, any>();
  let events: any[] = [];
  let sequence = 0;
  let failCommit = false;
  let failAudit = false;
  let failAuditAt = 0;
  let auditAttempts = 0;
  let failEvidenceCreateAt = 0;
  let evidenceCreateAttempts = 0;
  let failList = false;
  const locks: string[] = [];
  const currentActor = () => tenantStorage.getStore()?.userId;
  const operative = () => currentActor() === 'admin' || currentActor() === order.responsibleUserId || order.members.some((member: any) => member.userId === currentActor() && member.function !== 'OBSERVER');
  const queryOrder = () => ({ ...order, members: order.members.filter((member: any) => member.userId === currentActor()) });
  const itemEvidence = (itemId: string) => [...evidence.values()].filter(row => row.checklistItemId === itemId);
  const snapshotDispatch = () => ({ ...dispatch, manufacturingOrder: queryOrder(), checklistItems: [...items.values()].map(item => ({ ...item, evidence: itemEvidence(item.id) })) });
  const patch = (row: any, data: any) => { for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === 'object' && 'increment' in value ? Number(row[key]) + Number((value as any).increment) : value; return { ...row }; };
  const tx: any = {
    $queryRaw: async (strings: TemplateStringsArray) => { locks.push(strings.join('?')); return []; },
    user: { findFirst: async ({ where }: any) => where.tenantId === 'tenant' ? actors[where.id] || null : null },
    manufacturingOrder: {
      findFirst: async ({ where }: any) => where.id === order.id && where.tenantId === 'tenant' ? queryOrder() : null,
      update: async ({ data }: any) => patch(order, data),
    },
    manufacturingDispatch: {
      findFirst: async ({ where, select }: any) => {
        if (where.id !== dispatch.id || where.tenantId !== 'tenant') return null;
        if (select?.id) return operative() ? { id: dispatch.id } : null;
        return snapshotDispatch();
      },
      update: async ({ data }: any) => patch(dispatch, data),
    },
    manufacturingDispatchChecklistItem: {
      findFirst: async ({ where, select }: any) => {
        const item = items.get(where.id);
        if (!item || item.tenantId !== where.tenantId) return null;
        if (select?.id) return operative() ? { id: item.id } : null;
        if (select?.dispatchId) return { dispatchId: item.dispatchId };
        return { ...item, evidence: itemEvidence(item.id), dispatch: snapshotDispatch() };
      },
      update: async ({ where, data }: any) => patch(items.get(where.id), data),
    },
    manufacturingDispatchChecklistEvidence: {
      create: async ({ data }: any) => { if (++evidenceCreateAttempts === failEvidenceCreateAt) throw new Error('Evidence create failure'); const row = { id: `evidence-${++sequence}`, createdAt: new Date(), ...data }; evidence.set(row.id, row); return { ...row }; },
      findFirst: async ({ where, select }: any) => {
        const row = evidence.get(where.id);
        if (!row || row.tenantId !== where.tenantId) return null;
        if (select?.id) return operative() ? { id: row.id } : null;
        return { ...row, checklistItem: { ...items.get(row.checklistItemId), evidence: itemEvidence(row.checklistItemId), dispatch: snapshotDispatch() } };
      },
      count: async ({ where }: any) => itemEvidence(where.checklistItemId).filter(row => row.tenantId === where.tenantId).length,
      delete: async ({ where }: any) => { const row = evidence.get(where.id); evidence.delete(where.id); return row; },
    },
    manufacturingAuditEvent: { create: async ({ data }: any) => { if (failAudit || ++auditAttempts === failAuditAt) throw new Error('Audit failure'); events.push(data); return data; } },
  };
  const prisma: any = { ...tx, $transaction: async (callback: any) => {
    const previous = structuredClone({ items: [...items], evidence: [...evidence], dispatch, order, events });
    try { const result = await callback(tx); if (failCommit) throw new Error('Commit failure'); return result; }
    catch (error) {
      items = new Map(previous.items); evidence = new Map(previous.evidence); events = previous.events;
      Object.assign(dispatch, previous.dispatch); Object.assign(order, previous.order);
      throw error;
    }
  } };
  const service = new ManufacturingDispatchService(prisma);
  service.list = async () => { if (failList) throw new Error('Response failure'); return [snapshotDispatch()]; };
  return {
    service, prisma, order, dispatch, locks,
    item: () => items.get('item')!, evidence: () => [...evidence.values()], events: () => events,
    run: (callback: () => Promise<any>, userId = 'admin', tenantId = 'tenant') => tenantStorage.run({ tenantId, userId }, callback),
    failCommit: (value: boolean) => { failCommit = value; }, failAudit: (value: boolean) => { failAudit = value; }, failList: (value: boolean) => { failList = value; },
    failAuditAt: (value: number) => { failAuditAt = value; auditAttempts = 0; },
    failEvidenceCreateAt: (value: number) => { failEvidenceCreateAt = value; evidenceCreateAttempts = 0; },
  };
}

async function withStorage(callback: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(join(tmpdir(), 'dispatch-checklist-evidence-test-'));
  const previous = process.env.ATTACHMENTS_DIR;
  process.env.ATTACHMENTS_DIR = root;
  try { await callback(root); }
  finally {
    await fs.rm(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.ATTACHMENTS_DIR; else process.env.ATTACHMENTS_DIR = previous;
  }
}

async function attachmentFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? attachmentFiles(join(root, entry.name)) : Promise.resolve([join(root, entry.name)])))).flat();
}

test('each checklist point accepts multiple private documents and pictures with read access after dispatch', async () => {
  await withStorage(async () => {
    const s = setup();
    await s.run(() => s.service.uploadChecklistEvidence('item', { ...dto, notes: 'Lista firmada' }, file), 'tech');
    await s.run(() => s.service.uploadChecklistEvidence('item', { title: 'Fotografía del anclaje' }, photo), 'operative');
    assert.equal(s.evidence().length, 2);
    const [document, image] = s.evidence();
    assert.equal(document.checklistItemId, 'item');
    assert.equal(document.title, dto.title);
    assert.equal(document.notes, 'Lista firmada');
    assert.equal(document.createdByUserId, 'tech');
    assert.equal(document.createdByName, 'Responsable');
    assert.ok(document.createdAt instanceof Date);
    assert.equal(document.filename, file.originalname);
    assert.equal(image.mimeType, 'image/png');
    assert.notEqual(document.storageKey, image.storageKey);
    assert.deepEqual(await fs.readFile(dispatchDocumentPath(image.storageKey)), png);
    assert.equal((await fs.stat(dispatchDocumentPath(image.storageKey))).mode & 0o777, 0o600);
    s.dispatch.status = 'DISPATCHED';
    for (const user of ['viewer', 'observer']) {
      const result = await s.run(() => s.service.checklistEvidenceFile(document.id), user);
      assert.deepEqual(result, { path: dispatchDocumentPath(document.storageKey), filename: file.originalname, mimeType: 'application/pdf', size: pdf.length });
    }
    await assert.rejects(s.run(() => s.service.checklistEvidenceFile(document.id), 'outsider'), /no encontrada/i);
    await assert.rejects(s.run(() => s.service.checklistEvidenceFile(document.id), 'admin', 'another-tenant'), /no encontrado/i);
  });
});

test('one batch attaches several pictures and documents with independent evidence and one version change', async () => {
  await withStorage(async root => {
    const s = setup();
    const files = [photo, { ...photo, originalname: 'protección.png' }, file];
    const result = await s.run(() => s.service.uploadChecklistEvidenceBatch('item', { ...dto, notes: 'Vistas del embalaje y lista firmada' }, files), 'operative');
    const evidence = s.evidence();
    assert.equal(evidence.length, files.length);
    assert.equal(result[0].checklistItems[0].evidence.length, files.length);
    assert.equal(new Set(evidence.map(row => row.id)).size, files.length);
    assert.equal(new Set(evidence.map(row => row.storageKey)).size, files.length);
    assert.equal(s.item().lockVersion, 2, 'the point changes once for the whole batch');
    assert.equal(s.dispatch.lockVersion, 2, 'the dispatch changes once for the whole batch');
    assert.equal(s.locks.length, 2, 'one batch acquires one dispatch/item lock pair');
    assert.equal(s.events().length, files.length);
    assert.equal((await attachmentFiles(root)).length, files.length);
    for (let index = 0; index < files.length; index++) {
      const row = evidence[index];
      assert.equal(row.filename, files[index].originalname);
      assert.equal(row.checklistItemId, 'item');
      assert.equal(row.title, dto.title);
      assert.equal(row.notes, 'Vistas del embalaje y lista firmada');
      assert.equal(row.createdByUserId, 'operative');
      assert.equal(row.createdByName, 'Embalaje');
      assert.ok(row.createdAt instanceof Date);
      assert.deepEqual(await fs.readFile(dispatchDocumentPath(row.storageKey)), files[index].buffer);
      const audit = s.events().find(event => event.entityId === row.id);
      assert.ok(audit, 'each attachment has its own audit record');
      assert.equal(audit.action, 'DISPATCH_CHECKLIST_EVIDENCE_ADDED');
      assert.equal(audit.afterData.filename, files[index].originalname);
    }
  });
});

test('batch validation rejects empty selections, count, combined size and an invalid later file before storing anything', async () => {
  await withStorage(async root => {
    const s = setup();
    const largePdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(18 * 1024 * 1024, 32), Buffer.from('\n%%EOF\n')]);
    const largeFile = { ...file, buffer: largePdf };
    const attempts: Array<{ files?: typeof file[]; error: RegExp }> = [
      { error: /Selecciona|archivo|documento/i },
      { files: [], error: /Selecciona|archivo|documento/i },
      { files: Array.from({ length: 11 }, () => photo), error: /10/ },
      { files: [largeFile, largeFile, largeFile], error: /50 MB/ },
      { files: [photo, { ...file, originalname: 'ejecutable.exe' }], error: /ejecutable\.exe:.*Formato/i },
      { files: [photo, { ...file, buffer: Buffer.alloc(DISPATCH_DOCUMENT_MAX_BYTES + 1) }], error: /20 MB/ },
    ];
    let writes = 0;
    const writeFile = fs.writeFile;
    fs.writeFile = (async (...args: any[]) => { writes++; return (writeFile as any)(...args); }) as typeof fs.writeFile;
    try {
      for (const attempt of attempts) {
        await assert.rejects(s.run(() => s.service.uploadChecklistEvidenceBatch('item', dto, attempt.files)), attempt.error);
        assert.deepEqual(s.evidence(), []);
        assert.deepEqual(s.events(), []);
        assert.equal(s.item().lockVersion, 1);
        assert.equal(s.dispatch.lockVersion, 1);
        assert.equal(writes, 0, 'all selected files must validate before the first disk write');
        assert.deepEqual(await attachmentFiles(root), []);
      }
    } finally { fs.writeFile = writeFile; }
  });
});

test('batch upload rolls back every row and removes every file when a later insert, audit or commit fails', async () => {
  await withStorage(async root => {
    for (const failure of ['create', 'audit', 'commit'] as const) {
      const s = setup();
      if (failure === 'create') s.failEvidenceCreateAt(2);
      if (failure === 'audit') s.failAuditAt(2);
      if (failure === 'commit') s.failCommit(true);
      await assert.rejects(s.run(() => s.service.uploadChecklistEvidenceBatch('item', dto, [photo, file, { ...photo, originalname: 'lateral.png' }])), /Evidence create failure|Audit failure|Commit failure/);
      assert.deepEqual(s.evidence(), [], failure);
      assert.deepEqual(s.events(), [], failure);
      assert.equal(s.item().lockVersion, 1, failure);
      assert.equal(s.dispatch.lockVersion, 1, failure);
      assert.deepEqual(await attachmentFiles(root), [], failure);
    }
    const s = setup();
    s.failList(true);
    await assert.rejects(s.run(() => s.service.uploadChecklistEvidenceBatch('item', dto, [photo, file])), /Response failure/);
    assert.equal(s.evidence().length, 2, 'committed attachments survive a later response failure');
    for (const row of s.evidence()) assert.equal((await fs.stat(dispatchDocumentPath(row.storageKey))).size, row.size);
  });
});

test('upload and deletion rollback preserve file and database consistency', async () => {
  await withStorage(async root => {
    const s = setup();
    s.failAudit(true);
    await assert.rejects(s.run(() => s.service.uploadChecklistEvidence('item', dto, file)), /Audit failure/);
    assert.deepEqual(s.evidence(), []);
    assert.deepEqual(await attachmentFiles(root), []);
    s.failAudit(false); s.failCommit(true);
    await assert.rejects(s.run(() => s.service.uploadChecklistEvidence('item', dto, file)), /Commit failure/);
    assert.deepEqual(s.evidence(), []);
    assert.deepEqual(await attachmentFiles(root), []);
    s.failCommit(false); s.failList(true);
    await assert.rejects(s.run(() => s.service.uploadChecklistEvidence('item', dto, file)), /Response failure/);
    const [evidence] = s.evidence();
    assert.ok(evidence, 'committed evidence survives a response/list failure');
    assert.deepEqual(await fs.readFile(dispatchDocumentPath(evidence.storageKey)), pdf);
    s.failList(false); s.failCommit(true);
    await assert.rejects(s.run(() => s.service.removeChecklistEvidence(evidence.id)), /Commit failure/);
    assert.equal(s.evidence().length, 1);
    assert.deepEqual(await fs.readFile(dispatchDocumentPath(evidence.storageKey)), pdf);
    s.failCommit(false);
    await s.run(() => s.service.removeChecklistEvidence(evidence.id));
    assert.deepEqual(s.evidence(), []);
    assert.deepEqual(await attachmentFiles(root), []);
  });
});

test('checklist evidence writes require operative access, an active order and preparation state', async () => {
  await withStorage(async root => {
    const s = setup();
    for (const user of ['viewer', 'observer', 'outsider']) {
      await assert.rejects(s.run(() => s.service.uploadChecklistEvidence('item', dto, file), user), /operativa|no encontrado/i);
      await assert.rejects(s.run(() => s.service.updateChecklist('item', { lockVersion: s.item().lockVersion, status: 'COMPLETED', evidenceReference: 'Foto física' }), user), /operativa|no encontrado/i);
    }
    for (const status of ['ON_HOLD', 'CANCELED', 'COMPLETED']) {
      s.order.status = status;
      await assert.rejects(s.run(() => s.service.uploadChecklistEvidence('item', dto, file)), /orden no permite/i);
      await assert.rejects(s.run(() => s.service.updateChecklist('item', { lockVersion: s.item().lockVersion, status: 'COMPLETED', evidenceReference: 'Foto física' })), /orden no permite/i);
    }
    s.order.status = 'RELEASED';
    for (const status of ['DRAFT', 'READY', 'AUTHORIZED', 'DISPATCHED', 'DELIVERED', 'CANCELED']) {
      s.dispatch.status = status;
      await assert.rejects(s.run(() => s.service.uploadChecklistEvidence('item', dto, file)), /preparación/i);
    }
    s.dispatch.status = 'PREPARING';
    await assert.rejects(s.run(() => s.service.uploadChecklistEvidence('item', dto)), /Selecciona|archivo|documento/i);
    await assert.rejects(s.run(() => s.service.uploadChecklistEvidence('item', { title: ' ' }, file)), /título/i);
    await assert.rejects(s.run(() => s.service.uploadChecklistEvidence('item', dto, { ...file, originalname: 'ejecutable.exe' })), /formato|permitido|extensión/i);
    await assert.rejects(s.run(() => s.service.uploadChecklistEvidence('item', dto, { ...file, buffer: Buffer.alloc(DISPATCH_DOCUMENT_MAX_BYTES + 1) })), /20 MB/);
    assert.deepEqual(s.evidence(), []);
    assert.deepEqual(await attachmentFiles(root), []);
    await s.run(() => s.service.uploadChecklistEvidence('item', dto, file));
    const id = s.evidence()[0].id;
    await assert.rejects(s.run(() => s.service.removeChecklistEvidence(id), 'observer'), /operativa/i);
    s.dispatch.status = 'READY';
    await assert.rejects(s.run(() => s.service.removeChecklistEvidence(id)), /preparación/i);
    assert.equal((await attachmentFiles(root)).length, 1);
  });
});

test('completion accepts a reference or file and protects the last required attachment until reopening', async () => {
  await withStorage(async () => {
    const s = setup();
    await assert.rejects(s.run(() => s.service.updateChecklist('item', { lockVersion: s.item().lockVersion, status: 'COMPLETED' })), /evidencia|archivo|referencia/i);
    await s.run(() => s.service.uploadChecklistEvidence('item', dto, file));
    await s.run(() => s.service.uploadChecklistEvidence('item', dto, photo));
    await assert.rejects(s.run(() => s.service.updateChecklist('item', { lockVersion: 0, status: 'COMPLETED' })), /cambió|actualiza/i);
    await s.run(() => s.service.updateChecklist('item', { lockVersion: s.item().lockVersion, status: 'COMPLETED', notes: 'Protecciones revisadas' }), 'tech');
    assert.equal(s.item().status, 'COMPLETED');
    assert.equal(s.item().completedByUserId, 'tech');
    const completedAt = s.item().completedAt;
    await s.run(() => s.service.updateChecklist('item', { lockVersion: s.item().lockVersion, status: 'COMPLETED', notes: 'Protecciones revisadas y fotografiadas' }));
    assert.equal(s.item().completedByUserId, 'tech', 'editing notes retains the original completion actor');
    assert.deepEqual(s.item().completedAt, completedAt);
    await s.run(() => s.service.removeChecklistEvidence(s.evidence()[0].id));
    const last = s.evidence()[0];
    await assert.rejects(s.run(() => s.service.removeChecklistEvidence(last.id)), /evidencia|archivo|referencia|reabr/i);
    assert.deepEqual(await fs.readFile(dispatchDocumentPath(last.storageKey)), png);
    await s.run(() => s.service.updateChecklist('item', { lockVersion: s.item().lockVersion, status: 'PENDING' }));
    assert.equal(s.item().completedAt, null);
    assert.equal(s.item().completedByUserId, null);
    assert.equal(s.item().notes, 'Protecciones revisadas y fotografiadas');
    assert.equal(s.evidence().length, 1, 'reopening preserves the attached evidence');
    await s.run(() => s.service.removeChecklistEvidence(last.id));
    assert.deepEqual(s.evidence(), []);
    await s.run(() => s.service.updateChecklist('item', { lockVersion: s.item().lockVersion, status: 'PENDING', evidenceReference: 'Álbum físico F-25', notes: 'Preparación en curso' }));
    assert.equal(s.item().evidenceReference, 'Álbum físico F-25');
    await s.run(() => s.service.updateChecklist('item', { lockVersion: s.item().lockVersion, status: 'COMPLETED' }));
    assert.equal(s.item().evidenceReference, 'Álbum físico F-25');
    await s.run(() => s.service.uploadChecklistEvidence('item', dto, file));
    await s.run(() => s.service.removeChecklistEvidence(s.evidence()[0].id));
    assert.equal(s.item().status, 'COMPLETED', 'a persisted reference allows removal of the last attachment');
    await assert.rejects(s.run(() => s.service.updateChecklist('item', { lockVersion: s.item().lockVersion, status: 'COMPLETED', evidenceReference: null })), /evidencia|archivo|referencia/i);
  });
});

test('closing packaging revalidates evidence on completed controls', async () => {
  await withStorage(async () => {
    const s = setup();
    s.item().status = 'COMPLETED';
    await assert.rejects(s.run(() => s.service.markReady('dispatch', { lockVersion: s.dispatch.lockVersion })), /evidencia|archivo|referencia/i);
    assert.equal(s.dispatch.status, 'PREPARING');
    await s.run(() => s.service.uploadChecklistEvidence('item', dto, photo));
    await s.run(() => s.service.markReady('dispatch', { lockVersion: s.dispatch.lockVersion }));
    assert.equal(s.dispatch.status, 'READY');
    const reference = setup();
    reference.item().status = 'COMPLETED'; reference.item().evidenceReference = 'Registro fotográfico físico';
    await reference.run(() => reference.service.markReady('dispatch', { lockVersion: reference.dispatch.lockVersion }));
    assert.equal(reference.dispatch.status, 'READY');
  });
});

test('checklist mutations take the dispatch lock before the item lock', async () => {
  await withStorage(async () => {
    const s = setup();
    await s.run(() => s.service.uploadChecklistEvidence('item', dto, photo));
    await s.run(() => s.service.updateChecklist('item', { lockVersion: s.item().lockVersion, status: 'PENDING', notes: 'En preparación' }));
    await s.run(() => s.service.removeChecklistEvidence(s.evidence()[0].id));
    assert.equal(s.locks.length, 6);
    for (let index = 0; index < s.locks.length; index += 2) {
      assert.match(s.locks[index], /"ManufacturingDispatch".*FOR UPDATE/);
      assert.match(s.locks[index + 1], /"ManufacturingDispatchChecklistItem".*FOR UPDATE/);
    }
  });
});

test('missing, truncated or inaccessible checklist files return controlled errors', async () => {
  await withStorage(async () => {
    const s = setup();
    await assert.rejects(s.run(() => s.service.checklistEvidenceFile('missing')), /no encontrad[oa]/i);
    await s.run(() => s.service.uploadChecklistEvidence('item', dto, file));
    const [evidence] = s.evidence();
    const path = dispatchDocumentPath(evidence.storageKey);
    await fs.writeFile(path, Buffer.from('truncated'));
    await assert.rejects(s.run(() => s.service.checklistEvidenceFile(evidence.id)), /no disponible/i);
    await fs.unlink(path);
    await assert.rejects(s.run(() => s.service.checklistEvidenceFile(evidence.id)), /no disponible/i);
  });
});

test('HTTP multipart contract validates attachments and serves private authenticated downloads', async () => {
  await withStorage(async () => {
    const s = setup();
    class TestModule {}
    Module({ controllers: [ManufacturingDispatchController], providers: [
      { provide: PrismaService, useValue: s.prisma }, { provide: ManufacturingDispatchService, useValue: s.service },
      ManufacturingAccessGuard, ManufacturingValidationPipe,
    ] })(TestModule);
    const app = await NestFactory.create(TestModule, { logger: false });
    app.use((request: any, _response: any, next: () => void) => tenantStorage.run({ tenantId: request.headers['x-test-tenant'] || 'tenant', userId: request.headers['x-test-user'] || 'admin' }, next));
    try {
      await app.listen(0, '127.0.0.1');
      const base = `${await app.getUrl()}/manufacturing`;
      const post = (options: { user?: string; count?: number; extra?: string; bytes?: Buffer; filename?: string; title?: string } = {}) => {
        const body = new FormData(); body.append('title', options.title ?? dto.title);
        if (options.extra) body.append(options.extra, 'injected');
        for (let index = 0; index < (options.count ?? 1); index++) body.append('file', new Blob([new Uint8Array(options.bytes ?? pdf)], { type: 'application/pdf' }), options.filename ?? file.originalname);
        return fetch(`${base}/dispatch-checklist/item/evidence/file`, { method: 'POST', headers: { 'x-test-user': options.user ?? 'admin' }, body });
      };
      assert.equal((await post({ user: 'viewer' })).status, 403);
      assert.equal((await post({ user: 'observer' })).status, 404);
      assert.equal((await post({ extra: 'storageKey' })).status, 400);
      assert.equal((await post({ count: 0 })).status, 400);
      assert.equal((await post({ count: 2 })).status, 400);
      assert.equal((await post({ title: '' })).status, 400);
      assert.equal((await post({ filename: 'program.exe' })).status, 400);
      assert.equal((await post({ bytes: Buffer.alloc(DISPATCH_DOCUMENT_MAX_BYTES + 1) })).status, 413);
      assert.equal(s.evidence().length, 0);
      assert.equal((await post({ user: 'operative' })).status, 201);
      const [evidence] = s.evidence();
      const target = `${base}/dispatch-checklist-evidence/${evidence.id}`;
      const download = await fetch(`${target}/file`, { headers: { 'x-test-user': 'viewer' } });
      assert.equal(download.status, 200);
      assert.equal(download.headers.get('content-type'), 'application/pdf');
      assert.equal(download.headers.get('content-length'), String(pdf.length));
      assert.equal(download.headers.get('cache-control'), 'private, no-store');
      assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
      assert.match(download.headers.get('content-disposition')!, /^attachment;.*inspecci%C3%B3n.pdf/);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
      assert.equal((await fetch(`${target}/file`, { headers: { 'x-test-user': 'outsider' } })).status, 404);
      assert.equal((await fetch(`${target}/file`, { headers: { 'x-test-tenant': 'other-tenant' } })).status, 403);
      assert.equal((await fetch(target, { method: 'DELETE', headers: { 'x-test-user': 'observer' } })).status, 404);
      assert.equal((await fetch(target, { method: 'DELETE', headers: { 'x-test-user': 'operative' } })).status, 200);
      assert.equal(s.evidence().length, 0);
      assert.equal((await fetch(`${target}/file`)).status, 404);
    } finally { await app.close(); }
  });
});

test('HTTP batch multipart accepts several attachments and enforces permissions, field names and file limits', async () => {
  await withStorage(async root => {
    const s = setup();
    class TestModule {}
    Module({ controllers: [ManufacturingDispatchController], providers: [
      { provide: PrismaService, useValue: s.prisma }, { provide: ManufacturingDispatchService, useValue: s.service },
      ManufacturingAccessGuard, ManufacturingValidationPipe,
    ] })(TestModule);
    const app = await NestFactory.create(TestModule, { logger: false });
    app.use((request: any, _response: any, next: () => void) => tenantStorage.run({ tenantId: request.headers['x-test-tenant'] || 'tenant', userId: request.headers['x-test-user'] || 'admin' }, next));
    try {
      await app.listen(0, '127.0.0.1');
      const url = `${await app.getUrl()}/manufacturing/dispatch-checklist/item/evidence/files`;
      const cameraJpeg = { originalname: 'cámara.JPG', mimetype: 'image/jpg', buffer: Buffer.concat([dispatchJpeg, Buffer.from([0, 0, 0])]) };
      const post = (options: { user?: string; tenant?: string; extra?: string; field?: string; title?: string; files?: typeof file[] } = {}) => {
        const body = new FormData();
        body.append('title', options.title ?? dto.title);
        if (!options.extra) body.append('notes', 'Fotografías de anclajes y lista firmada');
        if (options.extra) body.append(options.extra, 'injected');
        for (const entry of options.files ?? [photo, { ...photo, originalname: 'protección.png' }, file, cameraJpeg]) {
          body.append(options.field ?? 'files', new Blob([new Uint8Array(entry.buffer)], { type: entry.mimetype }), entry.originalname);
        }
        return fetch(url, { method: 'POST', headers: { 'x-test-user': options.user ?? 'admin', 'x-test-tenant': options.tenant ?? 'tenant' }, body });
      };
      assert.equal((await post({ user: 'viewer' })).status, 403);
      assert.equal((await post({ user: 'observer' })).status, 404);
      assert.equal((await post({ user: 'outsider' })).status, 404);
      assert.equal((await post({ tenant: 'other-tenant' })).status, 403);
      assert.equal((await post({ extra: 'storageKey' })).status, 400);
      assert.equal((await post({ field: 'file' })).status, 400, 'the batch endpoint only accepts the plural files field');
      assert.equal((await post({ files: [] })).status, 400);
      assert.equal((await post({ files: Array.from({ length: 11 }, () => photo) })).status, 400);
      assert.equal((await post({ title: '' })).status, 400);
      assert.equal((await post({ files: [photo, { ...file, originalname: 'program.exe' }] })).status, 400);
      assert.equal((await post({ files: [photo, { ...file, buffer: Buffer.alloc(DISPATCH_DOCUMENT_MAX_BYTES + 1) }] })).status, 413);
      assert.deepEqual(s.evidence(), []);
      assert.deepEqual(await attachmentFiles(root), []);
      const response = await post({ user: 'operative' });
      assert.equal(response.status, 201);
      const dispatches = await response.json() as any[];
      assert.equal(dispatches[0].checklistItems[0].evidence.length, 4);
      assert.equal(s.evidence().length, 4);
      assert.deepEqual(s.evidence().map(row => row.filename), ['anclaje.png', 'protección.png', file.originalname, 'cámara.jpg']);
      assert.equal(s.evidence()[3].mimeType, 'image/jpeg');
      assert.deepEqual(await fs.readFile(dispatchDocumentPath(s.evidence()[3].storageKey)), cameraJpeg.buffer);
      assert.ok(s.evidence().every(row => row.createdByUserId === 'operative' && row.notes === 'Fotografías de anclajes y lista firmada'));
      assert.equal(s.item().lockVersion, 2);
      assert.equal(s.dispatch.lockVersion, 2);
      assert.equal(s.events().length, 4);
      assert.equal((await attachmentFiles(root)).length, 4);
    } finally { await app.close(); }
  });
});
