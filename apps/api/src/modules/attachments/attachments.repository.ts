import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class AttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async withTenant<T>(tenantId: string, fn: (tx: PrismaService) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId.replace(/'/g, "''")}'`);
      return fn(tx as unknown as PrismaService);
    });
  }

  async assertWorkOrderBelongs(tenantId: string, workOrderId: string): Promise<void> {
    await this.withTenant(tenantId, async (tx) => {
      const wo = await (tx as any).workOrder.findFirst({ where: { id: workOrderId }, select: { id: true } });
      if (!wo) throw new Error('WorkOrder no pertenece al tenant o no existe');
    });
  }

  create(data: {
    tenantId: string;
    workOrderId: string;
    type: 'IMAGE'|'VIDEO'|'AUDIO'|'DOCUMENT';
    filename: string;
    mimeType: string;
    size: number;
    storageKey: string;
    url: string;
    createdBy: string;
  }) {
    return this.withTenant(data.tenantId, async (tx) => {
      return (tx as any).attachment.create({
        data: {
          tenantId: data.tenantId,
          workOrderId: data.workOrderId,
          type: data.type,
          filename: data.filename,
          mimeType: data.mimeType,
          size: data.size,
          url: data.url,
          createdBy: data.createdBy,
        },
      });
    });
  }

  listByWorkOrder(tenantId: string, workOrderId: string) {
    return this.withTenant(tenantId, async (tx) => {
      return (tx as any).attachment.findMany({
        where: { tenantId, workOrderId },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  findById(tenantId: string, id: string) {
    return this.withTenant(tenantId, async (tx) => {
      return (tx as any).attachment.findFirst({ where: { id, tenantId } });
    });
  }

  delete(tenantId: string, id: string) {
    return this.withTenant(tenantId, async (tx) => {
      return (tx as any).attachment.deleteMany({ where: { id, tenantId } });
    });
  }
}
