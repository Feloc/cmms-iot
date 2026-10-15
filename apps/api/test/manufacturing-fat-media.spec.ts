import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module, NotFoundException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { validateFatMedia, fatMediaPath, storeFatMedia, FAT_MEDIA_MAX_BYTES } from '../src/modules/manufacturing/manufacturing-fat-media';
import { ManufacturingFatController } from '../src/modules/manufacturing/manufacturing-fat.controller';
import { ManufacturingFatService } from '../src/modules/manufacturing/manufacturing-fat.service';
import { ManufacturingAccessGuard } from '../src/modules/manufacturing/manufacturing-access.guard';
import { ManufacturingValidationPipe } from '../src/modules/manufacturing/manufacturing-validation.pipe';
import { PrismaService } from '../src/prisma.service';
import { tenantStorage } from '../src/common/tenant-context';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9kAAAAASUVORK5CYII=', 'base64');
const file = { originalname: 'foto.png', mimetype: 'image/png', buffer: png };

test('media validates content signatures, MIME, size and rejects unsafe formats and paths', () => {
  assert.equal(validateFatMedia(file).mimeType, 'image/png');
  assert.throws(() => validateFatMedia(), /Selecciona/);
  assert.throws(() => validateFatMedia({ ...file, buffer: Buffer.from('<svg onload="alert(1)">') }), /Formato/);
  assert.throws(() => validateFatMedia({ ...file, mimetype: 'image/jpeg' }), /Formato/);
  assert.throws(() => validateFatMedia({ ...file, buffer: Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024)]) }), /10 MB/);
  const video = Buffer.alloc(32); video.write('ftyp', 4); video.write('isom', 8);
  assert.equal(validateFatMedia({ originalname: 'video.mp4', mimetype: 'video/mp4', buffer: video }).mimeType, 'video/mp4');
  video.write('avif', 8);
  assert.throws(() => validateFatMedia({ originalname: 'fake.mp4', mimetype: 'video/mp4', buffer: video }), /Formato/);
  assert.throws(() => fatMediaPath('../../outside.png'), /inválido/);
  assert.equal(validateFatMedia({ ...file, originalname: '../../nombre\r\n.png' }).filename, 'nombre.png');
  assert.equal(validateFatMedia({ ...file, originalname: 'pagina.html' }).filename, 'pagina.png');
});

test('private media storage uses random names and preserves original bytes', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'fat-media-test-'));
  const previous = process.env.ATTACHMENTS_DIR; process.env.ATTACHMENTS_DIR = root;
  let stored: Awaited<ReturnType<typeof storeFatMedia>> | undefined;
  try {
    stored = await storeFatMedia(file);
    assert.notEqual(stored.storageKey, file.originalname);
    assert.deepEqual(await fs.readFile(fatMediaPath(stored.storageKey)), png);
    assert.equal((await fs.stat(fatMediaPath(stored.storageKey))).mode & 0o777, 0o600);
  } finally {
    if (stored) await fs.unlink(fatMediaPath(stored.storageKey));
    await fs.rmdir(join(root, 'fat')).catch(() => undefined); await fs.rmdir(root);
    if (previous === undefined) delete process.env.ATTACHMENTS_DIR; else process.env.ATTACHMENTS_DIR = previous;
  }
});

test('transaction failure removes its file; response failure after commit preserves evidence', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'fat-media-atomic-'));
  const previous = process.env.ATTACHMENTS_DIR; process.env.ATTACHMENTS_DIR = root;
  let failTransaction = true;
  const tx = {
    user: { findFirst: async () => ({ id: 'admin', role: 'ADMIN', name: 'Admin' }) },
    manufacturingFatEvidence: { create: async ({ data }: any) => { if (failTransaction) throw new Error('DB failure'); return { ...data, id: 'evidence' }; } },
  };
  const service = new ManufacturingFatService({ $transaction: async (fn: any) => fn(tx) } as any);
  (service as any).lockedCase = async () => ({ name: 'Punto', execution: { status: 'IN_PROGRESS', manufacturingOrderId: 'order' } });
  (service as any).bumpExecution = async () => undefined;
  (service as any).audit = async () => undefined;
  service.list = async () => { throw new Error('Response failure'); };
  try {
    await tenantStorage.run({ tenantId: 'tenant', userId: 'admin' }, async () => {
      await assert.rejects(() => service.uploadEvidence('case', { title: 'Foto' }, file), /DB failure/);
      assert.deepEqual(await fs.readdir(join(root, 'fat')), []);
      failTransaction = false;
      await assert.rejects(() => service.uploadEvidence('case', { title: 'Foto' }, file), /Response failure/);
      assert.equal((await fs.readdir(join(root, 'fat'))).length, 1);
    });
  } finally {
    for (const entry of await fs.readdir(join(root, 'fat')).catch(() => [])) await fs.unlink(join(root, 'fat', entry));
    await fs.rmdir(join(root, 'fat')).catch(() => undefined); await fs.rmdir(root);
    if (previous === undefined) delete process.env.ATTACHMENTS_DIR; else process.env.ATTACHMENTS_DIR = previous;
  }
});

test('multipart endpoints validate DTOs, roles, limits and authenticated download headers', async () => {
  let uploads = 0;
  const downloadRoot = await fs.mkdtemp(join(tmpdir(), 'fat-media-http-'));
  const downloadPath = join(downloadRoot, 'fixture.png'); await fs.writeFile(downloadPath, png);
  class TestModule {}
  Module({ controllers: [ManufacturingFatController], providers: [
    { provide: PrismaService, useValue: { user: { findFirst: async () => tenantStorage.getStore()?.userId === 'NONE' ? null : ({ role: tenantStorage.getStore()?.userId }) }, manufacturingFatCase: { findFirst: async () => null } } },
    { provide: ManufacturingFatService, useValue: {
      uploadEvidence: async (_id: string, dto: any, incoming: any, finding: boolean) => { validateFatMedia(incoming); uploads++; return { title: dto.title, finding: !!finding }; },
      evidenceFile: async (id: string) => { if (id !== 'e') throw new NotFoundException(); return { path: downloadPath, filename: 'inspección.png', mimeType: 'image/png', size: png.length }; },
    } },
    ManufacturingAccessGuard, ManufacturingValidationPipe,
  ] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.use((req: any, _res: any, next: () => void) => tenantStorage.run({ tenantId: 'test', userId: req.headers['x-test-role'] || 'ADMIN' }, next));
  try {
    await app.listen(0, '127.0.0.1'); const base = `${await app.getUrl()}/manufacturing`;
    const post = (route: string, role = 'ADMIN', extra?: string, bytes = png, count = 1) => {
      const body = new FormData(); body.append('title', 'Inspección eléctrica');
      for (let i = 0; i < count; i++) body.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'foto.png');
      if (extra) body.append(extra, 'injected');
      return fetch(`${base}/${route}`, { method: 'POST', headers: { 'x-test-role': role }, body });
    };
    assert.equal((await post('fat-cases/c/evidence/file', 'VIEWER')).status, 403);
    assert.equal((await post('fat-cases/c/evidence/file', 'TECH')).status, 404);
    assert.equal((await post('fat-cases/c/evidence/file', 'ADMIN', 'storageKey')).status, 400);
    assert.equal((await post('fat-cases/c/evidence/file', 'ADMIN', undefined, png, 0)).status, 400);
    assert.equal((await post('fat-cases/c/evidence/file', 'ADMIN', undefined, png, 2)).status, 400);
    assert.equal((await post('fat-cases/c/evidence/file', 'ADMIN', undefined, Buffer.alloc(FAT_MEDIA_MAX_BYTES + 1))).status, 413);
    assert.equal((await post('fat-cases/c/evidence/file')).status, 201);
    const result = await post('fat-deviations/d/evidence/file'); assert.equal(result.status, 201); assert.equal((await result.json() as any).finding, true);
    assert.equal(uploads, 2);
    const download = await fetch(`${base}/fat-evidence/e/file`);
    assert.equal(download.status, 200); assert.equal(download.headers.get('content-type'), 'image/png');
    assert.equal(download.headers.get('cache-control'), 'private, no-store'); assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
    assert.match(download.headers.get('content-disposition')!, /inspecci%C3%B3n.png/);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
    assert.equal((await fetch(`${base}/fat-evidence/missing/file`)).status, 404);
    assert.equal((await fetch(`${base}/fat-evidence/e/file`, { headers: { 'x-test-role': 'NONE' } })).status, 403);
  } finally { await app.close(); await fs.unlink(downloadPath); await fs.rmdir(downloadRoot); }
});
