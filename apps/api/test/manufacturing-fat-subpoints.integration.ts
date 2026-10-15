import assert from 'node:assert/strict';
import { tenantStorage } from '../src/common/tenant-context';
import { ManufacturingFatService } from '../src/modules/manufacturing/manufacturing-fat.service';

// Runs inside the full lifecycle rollback; no production orders are modified.
export async function verifyFatSubpoints(db: any, service: ManufacturingFatService, admin: any, execution: any) {
  await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, async () => {
    const read = async () => (await service.list(execution.manufacturingOrderId)).find((e: any) => e.id === execution.id)!;
    const parentId = execution.cases.find((c: any) => !c.parentCaseId).id;
    const row = async (id = parentId) => (await read()).cases.find((c: any) => c.id === id);
    const parent = await row(); assert.equal(parent.result, 'PASS');
    const protocolChild = (await read()).cases.find((c: any) => c.parentCaseId === parentId && c.origin === 'PROTOCOL');
    assert.ok(protocolChild); assert.equal(protocolChild.name, 'Revisión complementaria');
    const originalTemplate = await db.manufacturingFatTemplateCase.findUnique({ where: { id: parent.templateCaseId } });
    const body = { name: 'Bornera X1', acceptanceCriteria: 'Conductores identificados', reason: 'Se detectó necesidad de revisión específica', evidenceRequired: true, lockVersion: parent.lockVersion };
    const observer = await db.user.findFirst({ where: { tenantId: admin.tenantId, email: 'fat-observer@test.invalid' } });
    const operator = await db.user.findFirst({ where: { tenantId: admin.tenantId, email: 'fat-operator@test.invalid' } });
    await tenantStorage.run({ tenantId: admin.tenantId, userId: observer.id }, async () => {
      await assert.rejects(() => service.createSubpoint(parentId, body), /función operativa/);
    });
    await tenantStorage.run({ tenantId: admin.tenantId, userId: operator.id }, () => service.createSubpoint(parentId, body));
    assert.equal((await row()).result, 'PENDING');
    const child = (await read()).cases.find((c: any) => c.parentCaseId === parentId && c.origin === 'EXECUTION');
    assert.equal(child.addedByUserId, operator.id); assert.equal(child.additionReason, body.reason);
    assert.ok((await row()).history.some((event: any) => event.afterData.previousResult === 'PASS'));
    await assert.rejects(() => service.createSubpoint(parentId, body), /cambió/);
    await assert.rejects(() => service.createSubpoint(child.id, { ...body, lockVersion: child.lockVersion }), /un nivel/);
    await assert.rejects(async () => service.recordCase(parentId, { lockVersion: (await row()).lockVersion, result: 'PASS' }), /subpuntos obligatorios/);
    let c = await row(child.id);
    await service.recordCase(c.id, { lockVersion: c.lockVersion, result: 'PASS' });
    await assert.rejects(async () => service.recordCase(parentId, { lockVersion: (await row()).lockVersion, result: 'PASS' }), /evidencia/);
    await service.addEvidence(child.id, { title: 'Foto específica de bornera', reference: 'SUB-FOTO-001' });
    assert.equal((await row(child.id)).evidence.length, 1);
    assert.ok(!(await row()).evidence.some((e: any) => e.reference === 'SUB-FOTO-001'));
    await service.recordCase(parentId, { lockVersion: (await row()).lockVersion, result: 'PASS' });
    c = await row(child.id);
    await service.recordCase(c.id, { lockVersion: c.lockVersion, result: 'FAIL', notes: 'Dos conductores sin identificar' });
    assert.equal((await row()).result, 'PENDING');
    c = await row(child.id); let finding = c.deviations[0];
    await assert.rejects(() => service.voidSubpoint(c.id, { lockVersion: c.lockVersion, reason: 'No ocultar no conformidades' }), /Cierra las novedades/);
    await assert.rejects(async () => service.recordCase(parentId, { lockVersion: (await row()).lockVersion, result: 'PASS' }), /no conformidades/);
    await service.updateDeviation(finding.id, { lockVersion: finding.lockVersion, status: 'ACCEPTED_AS_IS', resolutionNotes: 'Concesión menor documentada para prototipo' });
    await service.recordCase(parentId, { lockVersion: (await row()).lockVersion, result: 'PASS' });
    finding = (await row(child.id)).deviations[0];
    await service.updateDeviation(finding.id, { lockVersion: finding.lockVersion, status: 'OPEN' });
    assert.equal((await row()).result, 'PENDING');
    finding = (await row(child.id)).deviations[0];
    await service.updateDeviation(finding.id, { lockVersion: finding.lockVersion, status: 'ACCEPTED_AS_IS', resolutionNotes: 'Concesión revisada y documentada nuevamente' });
    c = await row(child.id);
    await tenantStorage.run({ tenantId: admin.tenantId, userId: operator.id }, async () => {
      await assert.rejects(() => service.voidSubpoint(c.id, { lockVersion: c.lockVersion, reason: 'Solo un administrador autoriza' }), /Solo ADMIN/);
    });
    await service.voidSubpoint(c.id, { lockVersion: c.lockVersion, reason: 'Revisión duplicada, se conserva todo el expediente' });
    c = await row(child.id); assert.ok(c.voidedAt); assert.equal(c.evidence.length, 1); assert.equal(c.deviations.length, 1); assert.equal(c.result, 'FAIL');
    assert.equal((await read()).summary.voidedCount, 1);
    await assert.rejects(() => service.recordCase(c.id, { lockVersion: c.lockVersion, result: 'PASS' }), /anulado/);
    await assert.rejects(() => service.addEvidence(c.id, { title: 'No modificar', reference: 'REF' }), /anulado/);
    await assert.rejects(() => service.createDeviation(c.id, { lockVersion: c.lockVersion, title: 'No modificar', description: 'El subpunto está anulado', kind: 'OBSERVATION', severity: 'MINOR' }), /anulado/);
    await assert.rejects(() => service.recordCase(protocolChild.id, { lockVersion: protocolChild.lockVersion, measuredValue: null }), /medición/);
    await service.recordCase(protocolChild.id, { lockVersion: protocolChild.lockVersion, measuredValue: 1.5 });
    assert.equal((await row()).result, 'PENDING', 'Subpoint completion must never auto-pass the parent');
    await service.recordCase(parentId, { lockVersion: (await row()).lockVersion, result: 'PASS' });
    let p = await row();
    await service.createSubpoint(parentId, { ...body, name: 'Opcional no ejecutado', evidenceRequired: false, required: false, lockVersion: p.lockVersion });
    assert.equal((await row()).result, 'PASS', 'Optional pending subpoint does not invalidate an already passing parent');
    assert.deepEqual((await db.manufacturingFatTemplateCase.findUnique({ where: { id: parent.templateCaseId } })).subpoints, originalTemplate.subpoints);
    const anotherExecution = await db.manufacturingFatExecution.findFirst({ where: { tenantId: admin.tenantId, manufacturedUnitId: execution.manufacturedUnitId, id: { not: execution.id } } });
    assert.equal(await db.manufacturingFatCase.count({ where: { executionId: anotherExecution.id, origin: 'EXECUTION' } }), 0);
    // Database constraints also enforce one level and execution scope, not only the controller.
    const existingChild = await row(protocolChild.id);
    await assert.rejects(() => db.$transaction((tx: any) => tx.manufacturingFatCase.update({ where: { id: existingChild.id }, data: { parentCaseId: child.id } })), /one subpoint level/);
    const foreignParent = await db.manufacturingFatCase.findFirst({ where: { executionId: anotherExecution.id, parentCaseId: null } });
    await assert.rejects(() => db.$transaction((tx: any) => tx.manufacturingFatCase.update({ where: { id: existingChild.id }, data: { parentCaseId: foreignParent.id } })), /Foreign key|foreign key/i);
    const outsider = await db.user.findFirst({ where: { tenantId: admin.tenantId, email: 'fat-outsider@test.invalid' } });
    p = await row();
    await tenantStorage.run({ tenantId: admin.tenantId, userId: outsider.id }, async () => { await assert.rejects(() => service.createSubpoint(parentId, { ...body, lockVersion: p.lockVersion }), /función operativa/); });
    await db.manufacturingFatExecution.update({ where: { id: execution.id }, data: { status: 'AWAITING_APPROVAL' } });
    await assert.rejects(() => service.createSubpoint(parentId, { ...body, lockVersion: p.lockVersion }), /durante la ejecución/);
    await assert.rejects(async () => service.voidSubpoint(existingChild.id, { lockVersion: (await row(existingChild.id)).lockVersion, reason: 'No cambiar estructura pendiente' }), /bloqueada/);
    await db.manufacturingFatExecution.update({ where: { id: execution.id }, data: { status: 'IN_PROGRESS' } });
    console.log('PASS: subpuntos de protocolo/ejecución, cambios de alcance, concesiones, reapertura, anulación y bloqueo de estructura');
  });
}
