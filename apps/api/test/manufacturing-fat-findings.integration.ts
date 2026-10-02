import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tenantStorage } from '../src/common/tenant-context';
import { ManufacturingFatService } from '../src/modules/manufacturing/manufacturing-fat.service';

// Runs in the rollback-only lifecycle test; no real orders/users are modified.
export async function verifyFatFindings(db: any, service: ManufacturingFatService, admin: any, reviewer: any, execution: any) {
  return tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, async () => {
    const read = async () => (await service.list(execution.manufacturingOrderId)).find((e: any) => e.id === execution.id)!;
    const review = <T>(fn: () => Promise<T>) => tenantStorage.run({ tenantId: admin.tenantId, userId: reviewer.id }, fn);
    const caseId = execution.cases[0].id;
    const row = async () => (await read()).cases.find((c: any) => c.id === caseId);
    const finding = async (id: string) => (await row()).deviations.find((d: any) => d.id === id);
    let c = await row();
    await service.recordCase(caseId, { lockVersion: c.lockVersion, result: 'PASS' });
    const operator = await db.user.create({ data: { tenantId: admin.tenantId, email: 'fat-operator@test.invalid', name: 'Operador FAT', role: 'TECH', password: 'not-a-login' } });
    const observer = await db.user.create({ data: { tenantId: admin.tenantId, email: 'fat-observer@test.invalid', name: 'Observador FAT', role: 'TECH', password: 'not-a-login' } });
    await db.manufacturingOrderMember.createMany({ data: [{ tenantId: admin.tenantId, manufacturingOrderId: execution.manufacturingOrderId, userId: operator.id, function: 'ENGINEERING' }, { tenantId: admin.tenantId, manufacturingOrderId: execution.manufacturingOrderId, userId: observer.id, function: 'OBSERVER' }] });
    const assignees = await service.findingAssignees(execution.manufacturingOrderId);
    assert.ok(assignees.some(p => p.id === operator.id)); assert.ok(!assignees.some(p => p.id === observer.id));
    const body = { title: 'Cable sin identificación', description: 'Falta identificar conductor de potencia', kind: 'NON_CONFORMITY' as const, severity: 'MINOR' as const, location: 'Tablero X1', responsibleUserId: operator.id, dueAt: '2030-01-01' };
    c = await row();
    await tenantStorage.run({ tenantId: admin.tenantId, userId: observer.id }, async () => {
      await assert.rejects(() => service.createDeviation(caseId, { ...body, lockVersion: c.lockVersion }), /función operativa/);
    });
    await assert.rejects(() => service.createDeviation(caseId, { ...body, responsibleUserId: observer.id, lockVersion: c.lockVersion }), /acceso operativo/);
    await service.createDeviation(caseId, { ...body, lockVersion: c.lockVersion });
    await assert.rejects(() => service.createDeviation(caseId, { ...body, lockVersion: c.lockVersion }), /cambió/);
    c = await row(); const first = c.deviations[0].id;
    assert.equal(c.result, 'FAIL');
    await service.createDeviation(caseId, { ...body, title: 'Tierra desconectada', severity: 'CRITICAL', lockVersion: c.lockVersion });
    c = await row(); const second = c.deviations[1].id;
    await assert.rejects(() => service.createDeviation(caseId, { ...body, kind: 'OBSERVATION', severity: 'MAJOR', lockVersion: c.lockVersion }), /no bloqueante/);
    await service.createDeviation(caseId, { ...body, title: 'Sugerencia de rotulado', kind: 'OBSERVATION', lockVersion: c.lockVersion });
    c = await row(); const observation = c.deviations[2].id;
    assert.equal(c.deviations.length, 3); assert.equal(new Set(c.deviations.map((d: any) => d.sequence)).size, 3);
    assert.equal((await read()).summary.blockingDeviationCount, 2);
    await assert.rejects(() => service.recordCase(caseId, { lockVersion: c.lockVersion, result: 'PASS' }), /Resuelve/);
    await service.addDeviationEvidence(first, { title: 'Cable antes de corregir', reference: 'FOTO-001' });
    c = await row(); assert.equal(c.evidence.length, 0); assert.equal(c.deviations[0].evidence.length, 1); assert.equal(c.deviations[1].evidence.length, 0);
    let d = await finding(second);
    await assert.rejects(() => service.updateDeviation(second, { lockVersion: d.lockVersion, status: 'ACCEPTED_AS_IS', resolutionNotes: 'Concesión no permitida para riesgo crítico' }), /no críticas/);
    d = await finding(first);
    await assert.rejects(() => service.updateDeviation(first, { lockVersion: d.lockVersion, status: 'RESOLVED', verificationNotes: 'Intento de saltar la corrección' }), /Transición/);
    await service.updateDeviation(first, { lockVersion: d.lockVersion, status: 'IN_REWORK', correctiveAction: 'Identificar el cable según plano' });
    d = await finding(first);
    await service.updateDeviation(first, { lockVersion: d.lockVersion, status: 'PENDING_VERIFICATION', resolutionNotes: 'Cable identificado con etiqueta permanente' });
    d = await finding(first);
    await assert.rejects(() => service.updateDeviation(first, { lockVersion: d.lockVersion, status: 'PENDING_VERIFICATION', resolutionNotes: 'Modificar la corrección sin devolver' }), /Devuelve/);
    await assert.rejects(() => service.updateDeviation(first, { lockVersion: d.lockVersion, status: 'RESOLVED', verificationNotes: 'Inspección propia sin excepción' }), /otro responsable/);
    await tenantStorage.run({ tenantId: admin.tenantId, userId: operator.id }, async () => {
      await assert.rejects(() => service.updateDeviation(first, { lockVersion: d.lockVersion, status: 'RESOLVED', verificationNotes: 'El operador no puede verificar' }), /Solo el responsable/);
    });
    await review(() => service.updateDeviation(first, { lockVersion: d.lockVersion, status: 'IN_REWORK', verificationNotes: 'Etiqueta ilegible, repetir la identificación' }));
    d = await finding(first);
    await service.updateDeviation(first, { lockVersion: d.lockVersion, status: 'PENDING_VERIFICATION', resolutionNotes: 'Etiqueta sustituida por otra legible' });
    d = await finding(first);
    await review(() => service.updateDeviation(first, { lockVersion: d.lockVersion, status: 'RESOLVED', verificationNotes: 'Identificación legible y conforme al plano' }));
    assert.equal((await read()).summary.blockingDeviationCount, 1);
    for (const status of ['IN_REWORK', 'PENDING_VERIFICATION', 'RESOLVED'] as const) {
      d = await finding(second);
      const command = () => service.updateDeviation(second, { lockVersion: d.lockVersion, status, correctiveAction: 'Conectar tierra de protección', resolutionNotes: 'Conexión realizada y continuidad medida', verificationNotes: 'Continuidad verificada de forma independiente' });
      if (status === 'RESOLVED') await review(command); else await command();
    }
    c = await row(); assert.equal(c.result, 'FAIL', 'Closing findings must not fabricate a passing retest');
    assert.equal((await read()).summary.blockingDeviationCount, 0); assert.equal((await read()).summary.openDeviationCount, 1);
    await service.recordCase(caseId, { lockVersion: c.lockVersion, result: 'PASS', notes: 'Reprueba general de inspección conforme' });
    d = await finding(first);
    await service.updateDeviation(first, { lockVersion: d.lockVersion, status: 'OPEN' });
    assert.equal((await row()).result, 'FAIL');
    d = await finding(first);
    await service.updateDeviation(first, { lockVersion: d.lockVersion, status: 'ACCEPTED_AS_IS', resolutionNotes: 'Concesión menor documentada por cliente' });
    c = await row(); await service.recordCase(caseId, { lockVersion: c.lockVersion, result: 'PASS' });
    d = await finding(first); assert.ok(d.history.length >= 7); assert.ok(d.history.some((e: any) => e.afterData.verificationNotes?.includes('ilegible')));
    const foreign = await db.tenant.create({ data: { slug: `fat-foreign-${randomUUID()}`, name: 'Foreign FAT rollback' } });
    const foreignUser = await db.user.create({ data: { tenantId: foreign.id, email: 'admin@test.invalid', name: 'Foreign', role: 'ADMIN', password: 'not-a-login' } });
    c = await row();
    await assert.rejects(() => service.createDeviation(caseId, { ...body, responsibleUserId: foreignUser.id, lockVersion: c.lockVersion }), /tenant/);
    await tenantStorage.run({ tenantId: foreign.id, userId: foreignUser.id }, async () => {
      await assert.rejects(() => service.addDeviationEvidence(first, { title: 'No autorizado', reference: 'REF' }), /no encontrada/);
    });
    return observation;
  });
}

export async function verifyApprovedObservation(service: ManufacturingFatService, admin: any, reviewer: any, orderId: string, executionId: string, observationId: string) {
  await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, async () => {
    const read = async () => (await service.list(orderId)).find((e: any) => e.id === executionId)!;
    let execution = await read(); let c = execution.cases[0];
    await assert.rejects(() => service.createDeviation(c.id, { lockVersion: c.lockVersion, title: 'Nueva falla', description: 'No crear después de firmar', kind: 'NON_CONFORMITY', severity: 'MAJOR' }), /ejecución/);
    const closed = c.deviations.find((d: any) => d.kind === 'NON_CONFORMITY');
    await assert.rejects(() => service.updateDeviation(closed.id, { lockVersion: closed.lockVersion, status: 'OPEN' }), /no permite/);
    await service.addDeviationEvidence(observationId, { title: 'Seguimiento posterior', reference: 'OBS-FOTO' });
    for (const status of ['IN_REWORK', 'PENDING_VERIFICATION', 'RESOLVED'] as const) {
      execution = await read(); const d = execution.cases[0].deviations.find((d: any) => d.id === observationId);
      const command = () => service.updateDeviation(d.id, { lockVersion: d.lockVersion, status, correctiveAction: 'Mejorar rotulado del tablero', resolutionNotes: 'Rotulado complementario instalado', verificationNotes: 'Recomendación atendida y verificada' });
      if (status === 'RESOLVED') await tenantStorage.run({ tenantId: admin.tenantId, userId: reviewer.id }, command); else await command();
    }
    execution = await read(); assert.equal(execution.status, 'APPROVED'); assert.equal(execution.summary.openDeviationCount, 0);
    assert.equal(execution.cases[0].result, 'PASS'); assert.equal(execution.approvals.length, 1);
    console.log('PASS: múltiples novedades FAT, permisos, evidencias, verificación, reapertura y seguimiento posaprobación');
  });
}
