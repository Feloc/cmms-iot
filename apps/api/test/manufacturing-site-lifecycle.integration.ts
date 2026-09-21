import assert from 'node:assert/strict';
import { tenantStorage } from '../src/common/tenant-context';
import { AssembliesService } from '../src/modules/assemblies/assemblies.service';
import { ManufacturingSiteDeploymentService } from '../src/modules/manufacturing/manufacturing-site-deployment.service';
import { ManufacturingSatService } from '../src/modules/manufacturing/manufacturing-sat.service';
import { ManufacturingHandoverService } from '../src/modules/manufacturing/manufacturing-handover.service';
import { ManufacturingControlService } from '../src/modules/manufacturing/manufacturing-control.service';
import { ManufacturingAccessGuard } from '../src/modules/manufacturing/manufacturing-access.guard';

// Called inside the supply test's rollback-only transaction. Tests actual services.
export async function verifySiteLifecycle(db: any, admin: any, reviewer: any, dispatch: any, unitId: string, orderId: string) {
  const assemblies = new AssembliesService(db);
  const site = new ManufacturingSiteDeploymentService(db, assemblies);
  const sat = new ManufacturingSatService(db);
  const handovers = new ManufacturingHandoverService(db);
  const control = new ManufacturingControlService(db);
  const review = <T>(fn: () => Promise<T>) => tenantStorage.run({ tenantId: admin.tenantId, userId: reviewer.id }, fn);
  await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, async () => {
    const before = await control.get(orderId);
    assert.equal(before.units.find(u => u.id === unitId)?.stage, 'Montaje en cliente');
    assert.equal((await control.list({})).total, 1);
    let deployment: any = (await site.create(dispatch.id))[0];
    const receipt = () => ({ lockVersion: deployment.lockVersion, decision: 'ACCEPTED' as const, receivedByName: 'Cliente prueba', evidenceReference: 'REC-TEST' });
    await assert.rejects(() => site.completeReceipt(deployment.id, receipt()), /control|verific|check|pendiente/i);
    for (const check of deployment.receiptChecks) {
      deployment = (await site.updateReceiptCheck(check.id, { lockVersion: check.lockVersion, status: 'PASSED', evidenceReference: 'REC-CHECK' }))[0];
    }
    deployment = (await site.completeReceipt(deployment.id, receipt()))[0];
    const template = await assemblies.createTemplate({ code: 'SITE-TEST', name: 'Instalación de prueba', steps: [{ position: 1, phase: 'Montaje', name: 'Instalar máquina', estimatedMinutes: 5 }] });
    deployment = (await site.createInstallation(deployment.id, { lockVersion: deployment.lockVersion, templateId: template.id, scheduledStartAt: new Date().toISOString(), technicianIds: [admin.id] }))[0];
    const installationId = deployment.assemblyExecutionId;
    let installation: any = await assemblies.get(installationId);
    for (const activity of installation.activities) {
      await assemblies.startActivity(installationId, activity.id);
      installation = await assemblies.completeActivity(installationId, activity.id, { notes: 'Instalación comprobada' });
    }
    assert.equal(installation.status, 'COMPLETED');
    deployment = (await site.list(orderId))[0];
    assert.equal(deployment.status, 'READY_FOR_SAT');
    const protocol = await sat.createTemplate({ code: 'SAT-TEST', name: 'SAT de prueba', cases: [{ position: 1, name: 'Ajuste de velocidad', acceptanceCriteria: '10 ± 1', resultType: 'NUMERIC', minimumValue: 9, maximumValue: 11 }] });
    await assert.rejects(() => sat.createExecution(deployment.id, { templateId: protocol.id }), /firmas/);
    const signature = 'data:image/png;base64,iVBORw0KGgo=';
    await assemblies.updateSignatures(installationId, { technicianSignature: signature, receiverSignature: signature });
    let execution: any = (await sat.createExecution(deployment.id, { templateId: protocol.id }))[0];
    execution = (await sat.start(execution.id, { lockVersion: execution.lockVersion }))[0];
    execution = (await sat.recordCase(execution.cases[0].id, { lockVersion: execution.cases[0].lockVersion, result: 'FAIL', measuredValue: 12, notes: 'Ajuste menor pendiente', deviationSeverity: 'MINOR' }))[0];
    let deviation = execution.cases[0].deviations[0];
    await assert.rejects(() => sat.submit(execution.id, { lockVersion: execution.lockVersion }), /responsable|fecha|acción/);
    execution = (await sat.updateDeviation(deviation.id, { lockVersion: deviation.lockVersion, status: 'IN_REWORK', correctiveAction: 'Ajustar velocidad en sitio', responsibleUserId: admin.id, dueAt: new Date(Date.now() + 86400000).toISOString() }))[0];
    execution = (await sat.submit(execution.id, { lockVersion: execution.lockVersion }))[0];
    const acceptance = { lockVersion: execution.lockVersion, decision: 'ACCEPTED_WITH_PENDING_ITEMS' as const, clientName: 'Cliente', clientRole: 'Supervisor', clientSignature: signature, warrantyMonths: 12 };
    await assert.rejects(() => sat.decide(execution.id, acceptance), /otro responsable/);
    execution = (await review(() => sat.decide(execution.id, acceptance)))[0];
    await assert.rejects(() => handovers.create(unitId, {}), /SAT/);
    assert.equal((await control.get(orderId)).units.find(u => u.id === unitId)?.stage, 'SAT');
    deviation = execution.cases[0].deviations[0];
    execution = (await sat.updateDeviation(deviation.id, { lockVersion: deviation.lockVersion, status: 'RESOLVED', resolutionNotes: 'Velocidad ajustada y verificada: 10 unidades por minuto' }))[0];
    assert.equal(execution.status, 'ACCEPTED');
    let handover: any = (await handovers.create(unitId, {}))[0];
    const training = { topic: 'Operación segura', deliveredAt: new Date().toISOString(), durationHours: 2, instructorName: 'Instructor', clientContactName: 'Cliente', attendeeCount: 2, evidenceReference: 'TRAIN-TEST' };
    handover = (await handovers.addTraining(handover.id, training))[0];
    handover = (await handovers.removeTraining(handover.trainings[0].id))[0];
    assert.equal(handover.documents.find((d: any) => d.documentType === 'TRAINING_RECORD').status, 'PENDING');
    handover = (await handovers.addTraining(handover.id, training))[0];
    const spare = { description: 'Sensor de respaldo', quantity: 1, unit: 'UND' };
    handover = (await handovers.addSpare(handover.id, spare))[0];
    handover = (await handovers.removeSpare(handover.spares[0].id))[0];
    assert.equal(handover.documents.find((d: any) => d.documentType === 'SPARE_PARTS_LIST').status, 'PENDING');
    await assert.rejects(() => handovers.markReady(handover.id, { lockVersion: handover.lockVersion }), /documentos/);
    handover = (await handovers.addSpare(handover.id, spare))[0];
    for (const doc of handover.documents.filter((d: any) => d.status === 'PENDING')) {
      handover = (await handovers.updateDocument(doc.id, { lockVersion: doc.lockVersion, status: 'PROVIDED', reference: `DOC-${doc.documentType}` }))[0];
    }
    handover = (await handovers.markReady(handover.id, { lockVersion: handover.lockVersion }))[0];
    const finalAcceptance = { lockVersion: handover.lockVersion, clientName: 'Cliente', clientRole: 'Supervisor', clientSignature: signature };
    // One delivered unit must not prematurely close a multi-unit order.
    await db.$executeRawUnsafe('SAVEPOINT handover_multiunit');
    await handovers.accept(handover.id, finalAcceptance);
    assert.notEqual((await db.manufacturingOrder.findUnique({ where: { id: orderId } })).status, 'COMPLETED');
    await db.$executeRawUnsafe('ROLLBACK TO SAVEPOINT handover_multiunit');
    // Fixture: only this unit remains in scope for the final closure scenario.
    await db.manufacturedUnit.updateMany({ where: { manufacturingOrderId: orderId, id: { not: unitId } }, data: { status: 'CANCELED' } });
    handover = (await handovers.accept(handover.id, finalAcceptance))[0];
    assert.equal(handover.status, 'CLOSED');
    assert.ok(handover.asset.maintenanceTransferredAt);
    assert.equal((await control.get(orderId)).status, 'COMPLETED');
    assert.equal((await control.list({})).total, 0);
    assert.equal((await control.list({ closed: 'true' })).items[0].progress, 100);
    await assert.rejects(() => handovers.removeSpare(handover.spares[0].id), /orden|expediente/);

    const observer = await db.user.create({ data: { tenantId: admin.tenantId, email: 'observer@test.invalid', name: 'Observer', role: 'TECH', password: 'not-a-login' } });
    await db.manufacturingOrderMember.create({ data: { tenantId: admin.tenantId, manufacturingOrderId: orderId, userId: observer.id, function: 'OBSERVER' } });
    const guard = new ManufacturingAccessGuard(db);
    const context = (method: string) => ({ switchToHttp: () => ({ getRequest: () => ({ method, route: { path: '/api/manufacturing/handovers/:id/trainings' }, params: { id: handover.id } }) }) }) as any;
    await tenantStorage.run({ tenantId: admin.tenantId, userId: observer.id }, async () => {
      assert.equal(await guard.canActivate(context('GET')), true);
      await assert.rejects(() => guard.canActivate(context('POST')), /función operativa/);
      await control.get(orderId);
    });
    await db.user.update({ where: { id: observer.id }, data: { role: 'VIEWER' } });
    await tenantStorage.run({ tenantId: admin.tenantId, userId: observer.id }, async () => {
      await assert.rejects(() => guard.canActivate(context('POST')), /consultar/);
    });
  });
}
