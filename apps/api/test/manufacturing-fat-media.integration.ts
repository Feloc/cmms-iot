import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tenantStorage } from '../src/common/tenant-context';
import { ManufacturingFatService } from '../src/modules/manufacturing/manufacturing-fat.service';

export const fatTestImage = { originalname: 'inspección.png', mimetype: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9kAAAAASUVORK5CYII=', 'base64') };

// Called within the rollback-only lifecycle. File writes use a dedicated temp directory.
export async function verifyFatMedia(db: any, service: ManufacturingFatService, admin: any, observer: any, foreignUser: any, execution: any, caseId: string, findingId: string) {
  const root = await fs.mkdtemp(join(tmpdir(), 'fat-media-integration-'));
  const previous = process.env.ATTACHMENTS_DIR; process.env.ATTACHMENTS_DIR = root;
  try {
    const before = await service.list(execution.manufacturingOrderId);
    const original = before.find((e: any) => e.id === execution.id)!;
    const results = await service.uploadEvidence(caseId, { title: 'Foto del punto', notes: 'Estado inicial' }, fatTestImage);
    const current = results.find((e: any) => e.id === execution.id)!;
    assert.ok(current.lockVersion > original.lockVersion);
    const evidence = current.cases.find((c: any) => c.id === caseId).evidence.find((e: any) => e.hasFile);
    assert.ok(evidence); assert.equal(evidence.filename, 'inspección.png'); assert.equal(evidence.storageKey, undefined);
    assert.equal(evidence.createdByUserId, admin.id);
    const stored = await service.evidenceFile(evidence.id);
    assert.deepEqual(await fs.readFile(stored.path), fatTestImage.buffer);
    const withFinding = await service.uploadEvidence(findingId, { title: 'Foto de novedad' }, fatTestImage, true);
    const c = withFinding.find((e: any) => e.id === execution.id)!.cases.find((c: any) => c.id === caseId);
    assert.equal(c.evidence.filter((e: any) => e.hasFile).length, 1);
    assert.equal(c.deviations.find((d: any) => d.id === findingId).evidence.filter((e: any) => e.hasFile).length, 1);
    await tenantStorage.run({ tenantId: admin.tenantId, userId: observer.id }, async () => {
      await assert.rejects(() => service.uploadEvidence(caseId, { title: 'No autorizado' }, fatTestImage), /función operativa/);
    });
    await tenantStorage.run({ tenantId: foreignUser.tenantId, userId: foreignUser.id }, async () => {
      await assert.rejects(() => service.evidenceFile(evidence.id), /no encontrado/);
      await assert.rejects(() => service.uploadEvidence(findingId, { title: 'Otro tenant' }, fatTestImage, true), /no encontrada/);
    });
    const outsider = await db.user.create({ data: { tenantId: admin.tenantId, email: 'fat-outsider@test.invalid', name: 'Sin acceso', role: 'TECH', password: 'not-a-login' } });
    await tenantStorage.run({ tenantId: admin.tenantId, userId: outsider.id }, async () => {
      await assert.rejects(() => service.evidenceFile(evidence.id), /no encontrada/);
    });
    await db.manufacturingFatExecution.update({ where: { id: execution.id }, data: { status: 'AWAITING_APPROVAL' } });
    await assert.rejects(() => service.uploadEvidence(caseId, { title: 'No alterar pendiente' }, fatTestImage), /no puede agregarse/);
    await db.manufacturingFatExecution.update({ where: { id: execution.id }, data: { status: 'IN_PROGRESS' } });
    assert.equal((await fs.readdir(join(root, 'fat'))).length, 2, 'Rejected uploads must not leave files');
    await fs.unlink(stored.path);
    await assert.rejects(() => service.evidenceFile(evidence.id), /no disponible/);
    const events = await db.manufacturingAuditEvent.findMany({ where: { tenantId: admin.tenantId, entityId: evidence.id } });
    assert.ok(events.some((e: any) => e.afterData.filename === 'inspección.png'));
    console.log('PASS: archivos FAT privados, separación punto/novedad, permisos, auditoría y bloqueo durante aprobación');
  } finally {
    for (const entry of await fs.readdir(join(root, 'fat')).catch(() => [])) await fs.unlink(join(root, 'fat', entry));
    await fs.rmdir(join(root, 'fat')).catch(() => undefined); await fs.rmdir(root);
    if (previous === undefined) delete process.env.ATTACHMENTS_DIR; else process.env.ATTACHMENTS_DIR = previous;
  }
}
