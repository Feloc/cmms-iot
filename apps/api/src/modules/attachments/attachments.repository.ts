import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class AttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.attachment.create({ data });
  }

  listByWorkOrder(tenantId: string, workOrderId: string) {
    return this.prisma.attachment.findMany({
      where: { tenantId, workOrderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.attachment.findFirst({ where: { id, tenantId } });
  }

  delete(tenantId: string, id: string) {
    return this.prisma.attachment.deleteMany({ where: { id, tenantId } });
  }
}
