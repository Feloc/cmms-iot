import assert from 'node:assert/strict';
import { PrismaService } from '../src/prisma.service';
import { tenantStorage } from '../src/common/tenant-context';
import { ManufacturingSupplyService } from '../src/modules/manufacturing/manufacturing-supply.service';
import { ManufacturingStockReservationsService } from '../src/modules/manufacturing/manufacturing-stock-reservations.service';
import { ManufacturingSupplyRequestsService } from '../src/modules/manufacturing/manufacturing-supply-requests.service';

async function main() {
  const prisma = new PrismaService();
  const stamp = `supply-${Date.now()}`;
  let orderId: string | undefined;
  let orderNumber: string | undefined;
  let itemId: string | undefined;

  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, tenantId: true },
    });
    assert(admin, 'Se requiere un usuario administrador para la prueba');

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
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.cancel(buyRequest.id, { lockVersion: buyRequest.lockVersion, reason: 'Proveedor sin saldo' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); buy = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'BUY');
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.create(buy.id, { quantity: 4, supplierOrResponsible: 'Proveedor B', externalReference: 'OC-2' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); buy = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'BUY'); const replacement = buy.supplyRequests[1];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.deliver(replacement.id, { lockVersion: replacement.lockVersion, quantity: 4, reference: 'REM-2' }));

    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); const make = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'MAKE');
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.create(make.id, { quantity: 3, supplierOrResponsible: 'Taller interno' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); let makeRequest = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'MAKE').supplyRequests[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.update(makeRequest.id, { lockVersion: makeRequest.lockVersion, status: 'IN_PROGRESS', externalReference: 'OP-INT-1' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); makeRequest = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'MAKE').supplyRequests[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.deliver(makeRequest.id, { lockVersion: makeRequest.lockVersion, quantity: 3, reference: 'LOTE-INT' }));

    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); const subcontract = plans[0].requirements.find((line: any) => line.positionSnapshot === 50);
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.create(subcontract.id, { quantity: 3, supplierOrResponsible: 'Tercero CNC' }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); let subRequest = plans[0].requirements.find((line: any) => line.positionSnapshot === 50).supplyRequests[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.deliver(subRequest.id, { lockVersion: subRequest.lockVersion, quantity: 1 }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id)); subRequest = plans[0].requirements.find((line: any) => line.positionSnapshot === 50).supplyRequests[0];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => requestService.deliver(subRequest.id, { lockVersion: subRequest.lockVersion, quantity: 2 }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id));
    assert.equal(plans[0].status, 'ACTIVE');
    assert.equal(plans[0].summary.fulfilledCount, 4);
    assert.equal(plans[0].summary.openCount, 1);
    assert.equal(plans[0].summary.reservedQuantity, 0);
    assert.equal(plans[0].summary.issuedQuantity, 5);
    assert.equal(plans[0].summary.deliveredQuantity, 12);
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
    assert.equal(requestAuditCount, 13);
    console.log('OK: reservas y solicitudes BUY/MAKE/SUBCONTRACT con entregas parciales verificadas');
  } finally {
    if (orderId) {
      if (orderNumber) await prisma.inventoryMovement.deleteMany({ where: { referenceType: 'MANUFACTURING_STOCK_RESERVATION', referenceLabel: { startsWith: orderNumber } } });
      await prisma.manufacturingStockReservation.deleteMany({ where: { supplyRequirement: { supplyPlan: { manufacturingOrderId: orderId } } } });
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
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
