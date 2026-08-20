import assert from 'node:assert/strict';
import { PrismaService } from '../src/prisma.service';
import { tenantStorage } from '../src/common/tenant-context';
import { ManufacturingSupplyService } from '../src/modules/manufacturing/manufacturing-supply.service';

async function main() {
  const prisma = new PrismaService();
  const stamp = `supply-${Date.now()}`;
  let orderId: string | undefined;
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
        { tenantId: admin.tenantId, bomRevisionId: revision.id, position: 40, level: 0, itemCode: `SUB-${stamp}`, description: 'Opcional', quantityPerUnit: 1, uom: 'UND', supplyType: 'SUBCONTRACT', isOptional: true },
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
        bomLineCountSnapshot: 4,
        createdByUserId: admin.id,
        releasedAt: new Date(),
        releasedByUserId: admin.id,
        releasedByName: 'Prueba integral',
      },
    });

    const service = new ManufacturingSupplyService(prisma);
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.generate(order.id, { engineeringReleaseId: release.id }));
    let plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id));
    assert.equal(plans.length, 1);
    assert.equal(plans[0].summary.requirementCount, 4);

    const stockLines = plans[0].requirements.filter((line: any) => line.plannedSupplyType === 'STOCK');
    assert.deepEqual(stockLines.map((line: any) => line.stockCoveredQuantity), [3, 2]);
    assert.deepEqual(stockLines.map((line: any) => line.status), ['FULFILLED', 'PARTIAL']);
    const optional = plans[0].requirements.find((line: any) => line.isOptionalSnapshot);
    assert.equal(optional.included, false);
    assert.equal(optional.status, 'CANCELED');

    const partial = stockLines[1];
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.updateRequirement(partial.id, {
      lockVersion: partial.lockVersion,
      status: 'FULFILLED',
      fulfilledQuantity: 3,
    }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id));
    const purchase = plans[0].requirements.find((line: any) => line.plannedSupplyType === 'BUY');
    await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.updateRequirement(purchase.id, {
      lockVersion: purchase.lockVersion,
      status: 'FULFILLED',
      fulfilledQuantity: 6,
      supplier: 'Proveedor temporal',
      externalReference: 'OC-TEMP',
    }));
    plans = await tenantStorage.run({ tenantId: admin.tenantId, userId: admin.id }, () => service.list(order.id));
    assert.equal(plans[0].status, 'COMPLETED');
    assert.equal(plans[0].summary.fulfilledCount, 3);
    assert.equal(plans[0].summary.openCount, 0);

    const auditCount = await prisma.manufacturingAuditEvent.count({
      where: { manufacturingOrderId: order.id, action: { in: ['SUPPLY_PLAN_GENERATED', 'SUPPLY_REQUIREMENT_UPDATED'] } },
    });
    assert.equal(auditCount, 3);
    console.log('OK: plan generado, inventario distribuido, necesidades completadas y auditoría registrada');
  } finally {
    if (orderId) {
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
