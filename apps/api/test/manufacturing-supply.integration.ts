import assert from 'node:assert/strict';
import { PrismaService } from '../src/prisma.service';
import { tenantStorage } from '../src/common/tenant-context';
import { ManufacturingSupplyService } from '../src/modules/manufacturing/manufacturing-supply.service';
import { ManufacturingStockReservationsService } from '../src/modules/manufacturing/manufacturing-stock-reservations.service';
import { ManufacturingSupplyRequestsService } from '../src/modules/manufacturing/manufacturing-supply-requests.service';
import { ManufacturingSupplyInspectionsService } from '../src/modules/manufacturing/manufacturing-supply-inspections.service';
import { ManufacturingKitsService } from '../src/modules/manufacturing/manufacturing-kits.service';
import { ManufacturingAssemblyService } from '../src/modules/manufacturing/manufacturing-assembly.service';
import { ManufacturingFatService } from '../src/modules/manufacturing/manufacturing-fat.service';
import { ManufacturingDispatchService } from '../src/modules/manufacturing/manufacturing-dispatch.service';

async function main() {
  const prisma = new PrismaService();
  const stamp = `supply-${Date.now()}`;
  let orderId: string | undefined;
  let orderNumber: string | undefined;
  let itemId: string | undefined;
  let templateId: string | undefined;
  let fatTemplateId: string | undefined;

  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, tenantId: true },
    });
    assert(admin, 'Se requiere un usuario administrador para la prueba');

    const template = await prisma.assemblyTemplate.create({
      data: {
        tenantId: admin.tenantId,
        code: `ENS-${stamp}`,
        name: 'Ruta temporal de ensamble',
        version: 1,
        active: true,
        steps: {
          create: [
            { tenantId: admin.tenantId, position: 10, phase: 'Mecánica', name: 'Preparación mecánica', estimatedMinutes: 30, dependsOnPositions: [] },
            { tenantId: admin.tenantId, position: 20, phase: 'Eléctrica', name: 'Integración eléctrica', estimatedMinutes: 45, dependsOnPositions: [10], evidenceRequired: true },
            { tenantId: admin.tenantId, position: 30, phase: 'Automatización', name: 'Integración de control', estimatedMinutes: 60, dependsOnPositions: [20] },
          ],
        },
      },
    });
    templateId = template.id;

    const item = await prisma.inventoryItem.create({
      data: {
        tenantId: admin.tenantId,
        sku: `TMP-${stamp}`,
        name: 'Artículo temporal para abastecimiento',
        uom: 'UND',
        qty: 5,
        stocks: { create: { tenantId: admin.tenantId, warehouse: 'TEMP', stockOnHand: 5, stockReserved: 0 } },
      },
    });
    itemId = item.id;

    const order = await prisma.manufacturingOrder.create({
      data: {
        tenantId: admin.tenantId,
        number: `MO-TMP-${stamp}`,
        status: 'RELEASED',
        projectName: 'Prueba integral de abastecimiento',
        productName: 'Máquina temporal',
        quantity: 3,
        responsibleUserId: admin.id,
        createdByUserId: admin.id,
      },
    });
    orderId = order.id;
    orderNumber = order.number;
    await prisma.manufacturedUnit.createMany({ data: [1, 2, 3].map((unitNumber) => ({ tenantId: admin.tenantId, manufacturingOrderId: order.id, unitNumber })) });

    const bom = await prisma.manufacturingBom.create({
      data: {
        tenantId: admin.tenantId,
        manufacturingOrderId: order.id,
        code: `BOM-${stamp}`,
        name: 'BOM temporal',
        createdByUserId: admin.id,
      },
    });
    const revision = await prisma.manufacturingBomRevision.create({
      data: {
        tenantId: admin.tenantId,
        bomId: bom.id,
        sequence: 1,
        revisionCode: 'A',
        status: 'RELEASED',
        changeSummary: 'Prueba integral',
        createdByUserId: admin.id,
        releasedAt: new Date(),
        releasedByUserId: admin.id,
      },
    });
    await prisma.manufacturingBomLine.createMany({
      data: [
        { tenantId: admin.tenantId, bomRevisionId: revision.id, position: 10, level: 0, inventoryItemId: item.id, itemCode: item.sku, description: 'Stock A', quantityPerUnit: 1, uom: 'UND', supplyType: 'STOCK' },
        { tenantId: admin.tenantId, bomRevisionId: revision.id, position: 20, level: 0, inventoryItemId: item.id, itemCode: item.sku, description: 'Stock B', quantityPerUnit: 1, uom: 'UND', supplyType: 'STOCK' },
        { tenantId: admin.tenantId, bomRevisionId: revision.id, position: 30, level: 0, itemCode: `BUY-${stamp}`, description: 'Compra', quantityPerUnit: 2, uom: 'UND', supplyType: 'BUY' },
        { tenantId: admin.tenantId, bomRevisionId: revision.id, position: 40, level: 0, itemCode: `MAKE-${stamp}`, description: 'Fabricación interna', quantityPerUnit: 1, uom: 'UND', supplyType: 'MAKE' },
        { tenantId: admin.tenantId, bomRevisionId: revision.id, position: 50, level: 0, itemCode: `SUB-${stamp}`, description: 'Subcontratación', quantityPerUnit: 1, uom: 'UND', supplyType: 'SUBCONTRACT' },
        { tenantId: admin.tenantId, bomRevisionId: revision.id, position: 60, level: 0, itemCode: `OPT-${stamp}`, description: 'Opcional', quantityPerUnit: 1, uom: 'UND', supplyType: 'SUBCONTRACT', isOptional: true },
      ],
    });
    const release = await prisma.engineeringRelease.create({
      data: {
        tenantId: admin.tenantId,
        manufacturingOrderId: order.id,
        sequence: 1,
        releaseCode: 'REL-001',
        status: 'RELEASED',
        title: 'Liberación temporal',
        bomRevisionId: revision.id,
        bomCodeSnapshot: bom.code,
        bomRevisionCodeSnapshot: revision.revisionCode,
        bomLineCountSnapshot: 6,
        createdByUserId: admin.id,
        releasedAt: new Date(),
        releasedByUserId: admin.id,
        releasedByName: 'Prueba integral',
      },
    });

    const service = new ManufacturingSupplyService(prisma);
    const reservationService = new ManufacturingStockReservationsService(prisma, service);
    const requestService = new ManufacturingSupplyRequestsService(prisma, service);
    const inspectionService = new ManufacturingSupplyInspectionsService(prisma, service);
    const kitsService = new ManufacturingKitsService(prisma);
    const assemblyService = new ManufacturingAssemblyService(prisma);
    const fatService = new ManufacturingFatService(prisma);
    const dispatchService = new ManufacturingDispatchService(prisma);
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.generate(order.id, { engineeringReleaseId: release.id }));
    let plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id));
    assert.equal(plans.length, 1);
    assert.equal(plans[0].summary.requirementCount, 6);

    const stockLines = plans[0].requirements.filter((line: any) => line.plannedSupplyType === 'STOCK');
    assert.deepEqual(stockLines.map((line: any) => line.stockCoveredQuantity), [3, 2]);
    assert.deepEqual(stockLines.map((line: any) => line.status), ['OPEN', 'OPEN']);
    assert.deepEqual(stockLines.map((line: any) => line.fulfilledQuantity), [0, 0]);
    const optional = plans[0].requirements.find((line: any) => line.isOptionalSnapshot);
    assert.equal(optional.included, false);
    assert.equal(optional.status, 'CANCELED');

    const firstStockId = stockLines[0].inventoryItem.stocks[0].id;
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => reservationService.reserve(stockLines[0].id, { inventoryStockId: firstStockId, quantity: 3 }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id));
    let firstReservation = plans[0].requirements.find((line: any) => line.positionSnapshot === 10).stockReservations[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => reservationService.issue(firstReservation.id, { lockVersion: firstReservation.lockVersion, quantity: 2 }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id));
    firstReservation = plans[0].requirements.find((line: any) => line.positionSnapshot === 10).stockReservations[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => reservationService.release(firstReservation.id, { lockVersion: firstReservation.lockVersion, quantity: 1 }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id));
    const secondStock = plans[0].requirements.find((line: any) => line.positionSnapshot === 20);
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => reservationService.reserve(secondStock.id, { inventoryStockId: firstStockId, quantity: 3 }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id));
    const secondReservation = plans[0].requirements.find((line: any) => line.positionSnapshot === 20).stockReservations[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => reservationService.issue(secondReservation.id, { lockVersion: secondReservation.lockVersion, quantity: 3 }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id));
    const purchase = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'BUY');
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.updateRequirement(purchase.id, {
      lockVersion: purchase.lockVersion, supplier: 'Proveedor temporal',
    }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id));
    let buy = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'BUY');
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.create(buy.id, { quantity: 6, supplierOrResponsible: 'Proveedor A', promisedAt: '2026-09-01' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); buy = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'BUY');
    let buyRequest = buy.supplyRequests[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.deliver(buyRequest.id, { lockVersion: buyRequest.lockVersion, quantity: 2, reference: 'REM-1' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); buy = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'BUY'); buyRequest = buy.supplyRequests[0];
    let delivery = buyRequest.deliveries[0];
    assert.equal(buy.fulfilledQuantity, 0);
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => inspectionService.inspect(delivery.id, { lockVersion: delivery.lockVersion, acceptedQuantity: 1, rejectedQuantity: 1, reference: 'IC-1' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); buy = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'BUY'); buyRequest = buy.supplyRequests[0];
    assert.equal(buy.fulfilledQuantity, 1);
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.cancel(buyRequest.id, { lockVersion: buyRequest.lockVersion, reason: 'Proveedor sin saldo' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); buy = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'BUY');
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.create(buy.id, { quantity: 5, supplierOrResponsible: 'Proveedor B', externalReference: 'OC-2' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); buy = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'BUY'); const replacement = buy.supplyRequests[1];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.deliver(replacement.id, { lockVersion: replacement.lockVersion, quantity: 5, reference: 'REM-2' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); buy = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'BUY'); delivery = buy.supplyRequests[1].deliveries[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => inspectionService.inspect(delivery.id, { lockVersion: delivery.lockVersion, acceptedQuantity: 4, quarantinedQuantity: 1, reference: 'IC-2' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); buy = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'BUY'); delivery = buy.supplyRequests[1].deliveries[0];
    assert.equal(delivery.inspectionStatus, 'QUARANTINED');
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => inspectionService.resolveQuarantine(delivery.id, { lockVersion: delivery.lockVersion, acceptedQuantity: 1, reference: 'LIB-IC-2' }));

    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); const make = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'MAKE');
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.create(make.id, { quantity: 3, supplierOrResponsible: 'Taller interno' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); let makeRequest = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'MAKE').supplyRequests[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.update(makeRequest.id, { lockVersion: makeRequest.lockVersion, status: 'IN_PROGRESS', externalReference: 'OP-INT-1' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); makeRequest = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'MAKE').supplyRequests[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.deliver(makeRequest.id, { lockVersion: makeRequest.lockVersion, quantity: 3, reference: 'LOTE-INT' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); delivery = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'MAKE').supplyRequests[0].deliveries[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => inspectionService.inspect(delivery.id, { lockVersion: delivery.lockVersion, acceptedQuantity: 3, reference: 'IC-MAKE' }));

    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); const subcontract = plans[0].requirements.find((line: any) => line.positionSnapshot === 50);
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.create(subcontract.id, { quantity: 3, supplierOrResponsible: 'Tercero CNC' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); let subRequest = plans[0].requirements.find((line: any) => line.positionSnapshot === 50).supplyRequests[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.deliver(subRequest.id, { lockVersion: subRequest.lockVersion, quantity: 1 }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); subRequest = plans[0].requirements.find((line: any) => line.positionSnapshot === 50).supplyRequests[0]; delivery = subRequest.deliveries[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => inspectionService.inspect(delivery.id, { lockVersion: delivery.lockVersion, acceptedQuantity: 1 }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); subRequest = plans[0].requirements.find((line: any) => line.positionSnapshot === 50).supplyRequests[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.deliver(subRequest.id, { lockVersion: subRequest.lockVersion, quantity: 2 }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); subRequest = plans[0].requirements.find((line: any) => line.positionSnapshot === 50).supplyRequests[0]; delivery = subRequest.deliveries.find((item: any) => item.inspectionStatus === 'PENDING');
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => inspectionService.inspect(delivery.id, { lockVersion: delivery.lockVersion, acceptedQuantity: 2 }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id));
    assert.equal(plans[0].status, 'ACTIVE');
    assert.equal(plans[0].summary.fulfilledCount, 4);
    assert.equal(plans[0].summary.openCount, 1);
    assert.equal(plans[0].summary.reservedQuantity, 0);
    assert.equal(plans[0].summary.issuedQuantity, 5);
    assert.equal(plans[0].summary.deliveredQuantity, 13);
    assert.equal(plans[0].summary.acceptedQuantity, 12);
    assert.equal(plans[0].summary.rejectedQuantity, 1);
    assert.equal(plans[0].summary.quarantinedQuantity, 0);
    assert.equal(plans[0].summary.requestedQuantity, 0);

    const finalStock = await prisma.inventoryStock.findUniqueOrThrow({ where: { id: firstStockId } });
    assert.equal(finalStock.stockOnHand, 0);
    assert.equal(finalStock.stockReserved, 0);
    const movements = await prisma.inventoryMovement.groupBy({
      by: ['movementType'], where: { referenceType: 'MANUFACTURING_STOCK_RESERVATION', referenceLabel: { startsWith: order.number } }, _count: true,
    });
    assert.deepEqual(Object.fromEntries(movements.map((row) => [row.movementType, row._count])), { EXIT: 2, RELEASE: 1, RESERVATION: 2 });

    const auditCount = await prisma.manufacturingAuditEvent.count({
      where: { manufacturingOrderId: order.id, action: { in: ['SUPPLY_PLAN_GENERATED', 'SUPPLY_REQUIREMENT_UPDATED'] } },
    });
    assert.equal(auditCount, 2);
    const reservationAuditCount = await prisma.manufacturingAuditEvent.count({
      where: { manufacturingOrderId: order.id, action: { in: ['STOCK_RESERVED', 'STOCK_ISSUED', 'STOCK_RESERVATION_RELEASED'] } },
    });
    assert.equal(reservationAuditCount, 5);
    const requestAuditCount = await prisma.manufacturingAuditEvent.count({ where: { manufacturingOrderId: order.id, action: { startsWith: 'SUPPLY_' } } });
    assert.equal(requestAuditCount, 19);
    let kits = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => kitsService.generate(order.id));
    assert.equal(kits.length, 3);
    assert.deepEqual(kits.map((kit: any) => kit.summary.lineCount), [5, 5, 5]);
    for (let kitIndex = 0; kitIndex < 3; kitIndex += 1) {
      const kitId = kits[kitIndex].id;
      for (const position of [10, 20, 30, 40, 50]) {
        let currentKit = kits.find((item: any) => item.id === kitId);
        const line = currentKit.lines.find((item: any) => item.positionSnapshot === position);
        if (kitIndex === 2 && position === 10) {
          await assert.rejects(() => tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => kitsService.allocate(line.id, { lockVersion: line.lockVersion, quantity: 1 })), /Solo hay 0 aprobadas/);
          kits = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => kitsService.waive(line.id, { lockVersion: line.lockVersion, waivedQuantity: 1, reason: 'Liberación controlada para prueba integral' }));
        } else {
          kits = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => kitsService.allocate(line.id, { lockVersion: line.lockVersion, quantity: line.requiredQuantity }));
        }
      }
      let currentKit = kits.find((item: any) => item.id === kitId);
      assert.equal(currentKit.status, 'READY');
      kits = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => kitsService.release(kitId, { lockVersion: currentKit.lockVersion, notes: 'Kit verificado y liberado' }));
      currentKit = kits.find((item: any) => item.id === kitId);
      assert.equal(currentKit.status, 'RELEASED');
    }
    assert.equal(kits.filter((kit: any) => kit.status === 'RELEASED').length, 3);
    const kitAuditCount = await prisma.manufacturingAuditEvent.count({ where: { manufacturingOrderId: order.id, action: { in: ['MANUFACTURING_KIT_CREATED', 'KIT_MATERIAL_ALLOCATED', 'KIT_SHORTAGE_WAIVED', 'MANUFACTURING_KIT_RELEASED'] } } });
    assert.equal(kitAuditCount, 21);

    let executions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.create(kits[0].id, { templateId: template.id }));
    assert.equal(executions.length, 1);
    assert.equal(executions[0].status, 'PLANNED');
    assert.equal(executions[0].operations.length, 3);
    assert.equal(executions[0].plannedMinutes, 135);

    let [mechanical, electrical, control] = executions[0].operations;
    await assert.rejects(
      () => tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.operationAction(electrical.id, 'start', { lockVersion: electrical.lockVersion })),
      /predecesoras/,
    );

    executions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.operationAction(mechanical.id, 'start', { lockVersion: mechanical.lockVersion }));
    mechanical = executions[0].operations[0];
    assert.equal(executions[0].status, 'IN_PROGRESS');
    executions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.startTime(mechanical.id, { note: 'Inicio de preparación' }));
    mechanical = executions[0].operations[0];
    const openTimeLog = mechanical.timeLogs.find((log: any) => !log.endedAt);
    assert(openTimeLog);
    const consumableLine = executions[0].kit.lines.find((line: any) => line.positionSnapshot === 10);
    assert(consumableLine);
    executions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.addConsumption(mechanical.id, { kitLineId: consumableLine.id, quantity: 1, notes: 'Material instalado' }));
    mechanical = executions[0].operations[0];
    assert.equal(mechanical.consumedQuantity, 1);
    await assert.rejects(
      () => tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.addConsumption(mechanical.id, { kitLineId: consumableLine.id, quantity: 1 })),
      /Solo hay 0 asignadas/,
    );
    executions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.stopTime(openTimeLog.id, { note: 'Preparación terminada' }));
    mechanical = executions[0].operations[0];
    executions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.operationAction(mechanical.id, 'complete', { lockVersion: mechanical.lockVersion }));

    electrical = executions[0].operations[1];
    executions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.operationAction(electrical.id, 'start', { lockVersion: electrical.lockVersion }));
    electrical = executions[0].operations[1];
    await assert.rejects(
      () => tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.operationAction(electrical.id, 'complete', { lockVersion: electrical.lockVersion })),
      /requiere evidencia/,
    );
    executions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.addEvidence(electrical.id, { title: 'Verificación de cableado', reference: 'REG-ENS-001' }));
    electrical = executions[0].operations[1];
    executions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.operationAction(electrical.id, 'complete', { lockVersion: electrical.lockVersion }));

    control = executions[0].operations[2];
    executions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.operationAction(control.id, 'start', { lockVersion: control.lockVersion }));
    control = executions[0].operations[2];
    executions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.operationAction(control.id, 'block', { lockVersion: control.lockVersion, reason: 'Pendiente parámetro del variador' }));
    control = executions[0].operations[2];
    assert.equal(control.status, 'BLOCKED');
    executions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.operationAction(control.id, 'resume', { lockVersion: control.lockVersion }));
    control = executions[0].operations[2];
    executions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => assemblyService.operationAction(control.id, 'complete', { lockVersion: control.lockVersion }));
    assert.equal(executions[0].status, 'COMPLETED');
    assert.equal(executions[0].summary.progressPercent, 100);
    assert.equal(executions[0].summary.completedCount, 3);
    const assemblyAuditCount = await prisma.manufacturingAuditEvent.count({ where: { manufacturingOrderId: order.id, action: { startsWith: 'ASSEMBLY_' } } });
    const assemblyCreatedCount = await prisma.manufacturingAuditEvent.count({ where: { manufacturingOrderId: order.id, action: 'MANUFACTURING_ASSEMBLY_CREATED' } });
    assert.equal(assemblyAuditCount + assemblyCreatedCount, 13);

    const fatTemplate = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.createTemplate({
      code: `FAT-${stamp}`,
      name: 'Protocolo FAT temporal',
      cases: [
        { position: 10, section: 'Seguridad', name: 'Paro de emergencia', acceptanceCriteria: 'Detención segura', resultType: 'BOOLEAN', evidenceRequired: true },
        { position: 20, section: 'Rendimiento', name: 'Corriente de operación', acceptanceCriteria: 'Entre 10 y 20 A', resultType: 'NUMERIC', minimumValue: 10, maximumValue: 20, unit: 'A' },
        { position: 30, section: 'Documentación', name: 'Observación del cliente', acceptanceCriteria: 'Registro cuando aplique', resultType: 'TEXT', required: false },
      ],
    }));
    fatTemplateId = fatTemplate.id;
    await assert.rejects(
      () => tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.createExecution(kits[1].manufacturedUnitId, { templateId: fatTemplate.id })),
      /ensamble.*completado/i,
    );

    let fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.createExecution(kits[0].manufacturedUnitId, { templateId: fatTemplate.id }));
    let fat = fatExecutions[0];
    assert.equal(fat.status, 'DRAFT');
    assert.equal(fat.cases.length, 3);
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.start(fat.id, { lockVersion: fat.lockVersion }));
    fat = fatExecutions[0];
    let [safetyCase, numericCase, optionalCase] = fat.cases;
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.recordCase(safetyCase.id, { lockVersion: safetyCase.lockVersion, result: 'FAIL', notes: 'El contacto auxiliar no conmuta' }));
    fat = fatExecutions[0]; safetyCase = fat.cases[0];
    assert.equal(safetyCase.deviations.length, 1);
    let safetyDeviation = safetyCase.deviations[0];
    await assert.rejects(
      () => tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.submit(fat.id, { lockVersion: fat.lockVersion })),
      /todos los casos/,
    );
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.updateDeviation(safetyDeviation.id, { lockVersion: safetyDeviation.lockVersion, status: 'IN_REWORK', correctiveAction: 'Reemplazar el contacto auxiliar' }));
    fat = fatExecutions[0]; safetyCase = fat.cases[0]; safetyDeviation = safetyCase.deviations[0];
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.updateDeviation(safetyDeviation.id, { lockVersion: safetyDeviation.lockVersion, status: 'RESOLVED', resolutionNotes: 'Contacto reemplazado y continuidad verificada' }));
    fat = fatExecutions[0]; safetyCase = fat.cases[0];
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.recordCase(safetyCase.id, { lockVersion: safetyCase.lockVersion, result: 'PASS', notes: 'Reprueba conforme' }));
    fat = fatExecutions[0]; safetyCase = fat.cases[0];
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.addEvidence(safetyCase.id, { title: 'Registro de paro', reference: 'FAT-EVID-001' }));
    fat = fatExecutions[0]; numericCase = fat.cases[1];
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.recordCase(numericCase.id, { lockVersion: numericCase.lockVersion, measuredValue: 25, notes: 'Corriente sobre el límite' }));
    fat = fatExecutions[0]; numericCase = fat.cases[1];
    assert.equal(numericCase.result, 'FAIL');
    let numericDeviation = numericCase.deviations[0];
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.updateDeviation(numericDeviation.id, { lockVersion: numericDeviation.lockVersion, status: 'ACCEPTED_AS_IS', resolutionNotes: 'Concesión temporal aprobada para el prototipo' }));
    fat = fatExecutions[0]; optionalCase = fat.cases[2];
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.recordCase(optionalCase.id, { lockVersion: optionalCase.lockVersion, result: 'NOT_APPLICABLE' }));
    fat = fatExecutions[0];
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.submit(fat.id, { lockVersion: fat.lockVersion }));
    fat = fatExecutions[0];
    assert.equal(fat.status, 'AWAITING_APPROVAL');
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.decide(fat.id, { lockVersion: fat.lockVersion, decision: 'REJECTED', comments: 'Repetir sin concesión de corriente' }));
    fat = fatExecutions[0];
    assert.equal(fat.status, 'REJECTED');
    let readiness = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.dispatchReadiness(kits[0].manufacturedUnitId));
    assert.equal(readiness.ready, false);

    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.createExecution(kits[0].manufacturedUnitId, { templateId: fatTemplate.id }));
    fat = fatExecutions.find((item: any) => item.sequence === 2);
    assert(fat);
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.start(fat.id, { lockVersion: fat.lockVersion }));
    fat = fatExecutions.find((item: any) => item.sequence === 2); [safetyCase, numericCase, optionalCase] = fat.cases;
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.recordCase(safetyCase.id, { lockVersion: safetyCase.lockVersion, result: 'PASS' }));
    fat = fatExecutions.find((item: any) => item.sequence === 2); safetyCase = fat.cases[0];
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.addEvidence(safetyCase.id, { title: 'Reprueba de paro', reference: 'FAT-EVID-002' }));
    fat = fatExecutions.find((item: any) => item.sequence === 2); numericCase = fat.cases[1];
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.recordCase(numericCase.id, { lockVersion: numericCase.lockVersion, measuredValue: 15 }));
    fat = fatExecutions.find((item: any) => item.sequence === 2); optionalCase = fat.cases[2];
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.recordCase(optionalCase.id, { lockVersion: optionalCase.lockVersion, result: 'NOT_APPLICABLE' }));
    fat = fatExecutions.find((item: any) => item.sequence === 2);
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.submit(fat.id, { lockVersion: fat.lockVersion }));
    fat = fatExecutions.find((item: any) => item.sequence === 2);
    fatExecutions = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.decide(fat.id, { lockVersion: fat.lockVersion, decision: 'APPROVED', comments: 'Protocolo conforme' }));
    fat = fatExecutions.find((item: any) => item.sequence === 2);
    assert.equal(fat.status, 'APPROVED');
    assert.equal(fat.summary.dispatchReady, true);
    readiness = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => fatService.dispatchReadiness(kits[0].manufacturedUnitId));
    assert.equal(readiness.ready, true);
    assert.deepEqual(readiness.reasons, []);
    await assert.rejects(
      () => tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.create(kits[1].manufacturedUnitId, { destination: 'Cliente temporal' })),
      /FAT aprobado/,
    );
    await prisma.manufacturedUnit.update({ where: { id: kits[0].manufacturedUnitId }, data: { serialNumber: `SER-${stamp}` } });
    let dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.create(kits[0].manufacturedUnitId, { destination: 'Planta cliente', deliveryAddress: 'Zona industrial temporal', plannedDispatchAt: '2026-09-15T08:00:00-05:00' }));
    let dispatch = dispatches[0];
    assert.equal(dispatch.status, 'DRAFT');
    assert.equal(dispatch.checklistItems.length, 6);
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.start(dispatch.id, { lockVersion: dispatch.lockVersion }));
    dispatch = dispatches[0];
    await assert.rejects(
      () => tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.markReady(dispatch.id, { lockVersion: dispatch.lockVersion })),
      /destino, dirección y transportista/,
    );
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.update(dispatch.id, { lockVersion: dispatch.lockVersion, carrierName: 'Transportes temporales', carrierReference: 'COT-001' }));
    dispatch = dispatches[0];
    let firstDispatchCheck = dispatch.checklistItems[0];
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.updateChecklist(firstDispatchCheck.id, { lockVersion: firstDispatchCheck.lockVersion, status: 'COMPLETED', evidenceReference: 'EVID-TEMP' }));
    dispatch = dispatches[0]; firstDispatchCheck = dispatch.checklistItems[0];
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.updateChecklist(firstDispatchCheck.id, { lockVersion: firstDispatchCheck.lockVersion, status: 'PENDING' }));
    dispatch = dispatches[0];
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.addPackage(dispatch.id, { packageType: 'BOX', description: 'Bulto temporal corregible', grossWeightKg: 10 }));
    dispatch = dispatches[0];
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.removePackage(dispatch.packages[0].id));
    dispatch = dispatches[0];
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.addDocument(dispatch.id, { documentType: 'OTHER', title: 'Documento temporal', reference: 'TMP-DOC' }));
    dispatch = dispatches[0];
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.removeDocument(dispatch.documents[0].id));
    dispatch = dispatches[0];
    for (const item of dispatch.checklistItems) {
      dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.updateChecklist(item.id, { lockVersion: item.lockVersion, status: 'COMPLETED', evidenceReference: item.evidenceRequired ? `EVID-${item.position}` : undefined, notes: 'Control verificado' }));
      dispatch = dispatches[0];
    }
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.addPackage(dispatch.id, { packageType: 'CRATE', description: 'Máquina principal embalada', lengthCm: 240, widthCm: 160, heightCm: 210, netWeightKg: 1150, grossWeightKg: 1250, sealNumber: 'SELLO-001' }));
    dispatch = dispatches[0];
    assert.equal(dispatch.summary.grossWeightKg, 1250);
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.addDocument(dispatch.id, { documentType: 'PACKING_LIST', title: 'Lista de empaque', reference: 'PKL-001' }));
    dispatch = dispatches[0];
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.markReady(dispatch.id, { lockVersion: dispatch.lockVersion }));
    dispatch = dispatches[0];
    assert.equal(dispatch.status, 'READY');
    assert.equal(dispatch.serialNumberSnapshot, `SER-${stamp}`);
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.authorize(dispatch.id, { lockVersion: dispatch.lockVersion }));
    dispatch = dispatches[0];
    assert.equal(dispatch.status, 'AUTHORIZED');
    await assert.rejects(
      () => tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.dispatch(dispatch.id, { lockVersion: dispatch.lockVersion, trackingNumber: 'GUIA-001' })),
      /documento de transporte/,
    );
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.addDocument(dispatch.id, { documentType: 'TRANSPORT_DOCUMENT', title: 'Remesa terrestre', reference: 'REM-001' }));
    dispatch = dispatches[0];
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.dispatch(dispatch.id, { lockVersion: dispatch.lockVersion, trackingNumber: 'GUIA-001', driverName: 'Conductor temporal', vehiclePlate: 'TMP123' }));
    dispatch = dispatches[0];
    assert.equal(dispatch.status, 'DISPATCHED');
    dispatches = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => dispatchService.deliver(dispatch.id, { lockVersion: dispatch.lockVersion, receivedByName: 'Cliente receptor', proofReference: 'POD-001' }));
    dispatch = dispatches[0];
    assert.equal(dispatch.status, 'DELIVERED');
    assert.equal(dispatch.deliveryProofReference, 'POD-001');
    console.log('OK: abastecimiento, kits, ensamble, FAT, despacho y entrega integral verificados');
  } finally {
    if (orderId) {
      if (orderNumber) await prisma.inventoryMovement.deleteMany({ where: { referenceType: 'MANUFACTURING_STOCK_RESERVATION', referenceLabel: { startsWith: orderNumber } } });
      await prisma.manufacturingStockReservation.deleteMany({ where: { supplyRequirement: { supplyPlan: { manufacturingOrderId: orderId } } } });
      await prisma.manufacturingDispatchDocument.deleteMany({ where: { dispatch: { manufacturingOrderId: orderId } } });
      await prisma.manufacturingDispatchPackage.deleteMany({ where: { dispatch: { manufacturingOrderId: orderId } } });
      await prisma.manufacturingDispatchChecklistItem.deleteMany({ where: { dispatch: { manufacturingOrderId: orderId } } });
      await prisma.manufacturingDispatch.deleteMany({ where: { manufacturingOrderId: orderId } });
      await prisma.manufacturingFatApproval.deleteMany({ where: { execution: { manufacturingOrderId: orderId } } });
      await prisma.manufacturingFatDeviation.deleteMany({ where: { execution: { manufacturingOrderId: orderId } } });
      await prisma.manufacturingFatEvidence.deleteMany({ where: { fatCase: { execution: { manufacturingOrderId: orderId } } } });
      await prisma.manufacturingFatCase.deleteMany({ where: { execution: { manufacturingOrderId: orderId } } });
      await prisma.manufacturingFatExecution.deleteMany({ where: { manufacturingOrderId: orderId } });
      await prisma.manufacturingAssemblyConsumption.deleteMany({ where: { operation: { execution: { manufacturingOrderId: orderId } } } });
      await prisma.manufacturingAssemblyEvidence.deleteMany({ where: { operation: { execution: { manufacturingOrderId: orderId } } } });
      await prisma.manufacturingAssemblyTimeLog.deleteMany({ where: { operation: { execution: { manufacturingOrderId: orderId } } } });
      await prisma.manufacturingAssemblyOperation.deleteMany({ where: { execution: { manufacturingOrderId: orderId } } });
      await prisma.manufacturingAssemblyExecution.deleteMany({ where: { manufacturingOrderId: orderId } });
      await prisma.manufacturingKitLine.deleteMany({ where: { kit: { manufacturingOrderId: orderId } } });
      await prisma.manufacturingKit.deleteMany({ where: { manufacturingOrderId: orderId } });
      await prisma.manufacturingInspectionDecision.deleteMany({ where: { supplyDelivery: { supplyRequest: { supplyRequirement: { supplyPlan: { manufacturingOrderId: orderId } } } } } });
      await prisma.manufacturingSupplyDelivery.deleteMany({ where: { supplyRequest: { supplyRequirement: { supplyPlan: { manufacturingOrderId: orderId } } } } });
      await prisma.manufacturingSupplyRequest.deleteMany({ where: { supplyRequirement: { supplyPlan: { manufacturingOrderId: orderId } } } });
      await prisma.manufacturingSupplyRequirement.deleteMany({ where: { supplyPlan: { manufacturingOrderId: orderId } } });
      await prisma.manufacturingSupplyPlan.deleteMany({ where: { manufacturingOrderId: orderId } });
      await prisma.engineeringReleaseDocument.deleteMany({ where: { release: { manufacturingOrderId: orderId } } });
      await prisma.engineeringRelease.deleteMany({ where: { manufacturingOrderId: orderId } });
      await prisma.manufacturingBomLine.deleteMany({ where: { bomRevision: { bom: { manufacturingOrderId: orderId } } } });
      await prisma.manufacturingBomRevision.deleteMany({ where: { bom: { manufacturingOrderId: orderId } } });
      await prisma.manufacturingBom.deleteMany({ where: { manufacturingOrderId: orderId } });
      await prisma.manufacturingOrder.deleteMany({ where: { id: orderId } });
    }
    if (itemId) await prisma.inventoryItem.deleteMany({ where: { id: itemId } });
    if (templateId) {
      await prisma.assemblyTemplateStep.deleteMany({ where: { templateId } });
      await prisma.assemblyTemplate.deleteMany({ where: { id: templateId } });
    }
    if (fatTemplateId) {
      await prisma.manufacturingFatTemplateCase.deleteMany({ where: { templateId: fatTemplateId } });
      await prisma.manufacturingFatTemplate.deleteMany({ where: { id: fatTemplateId } });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
