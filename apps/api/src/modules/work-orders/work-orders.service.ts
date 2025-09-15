import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';

@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private getTenantId(): string {
    const t = tenantStorage.getStore();
    if (!t?.tenantId) throw new Error('No tenant in context');
    return t.tenantId;
  }

  async create(dto: CreateWorkOrderDto) {
    const tenantId = this.getTenantId();
    return this.prisma.workOrder.create({
      data: {
        tenantId,
        title: dto.title,
        description: dto.description,
        assetCode: dto.assetCode,
        priority: dto.priority as any,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assignedToUserIds: dto.assignedToUserIds ?? [],
        ...(dto.noticeId ? { noticeId: dto.noticeId } : {}),
      },
    });
  }

  async findAll() {
    const tenantId = this.getTenantId();
    return this.prisma.workOrder.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tenantId = this.getTenantId();
    return this.prisma.workOrder.findFirst({
      where: { id, tenantId },
    });
  }

  async update(id: string, dto: UpdateWorkOrderDto) {
    const tenantId = this.getTenantId();
    return this.prisma.workOrder.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status !== undefined ? { status: dto.status as any } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority as any } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        ...(dto.startedAt !== undefined ? { startedAt: dto.startedAt ? new Date(dto.startedAt) : null } : {}),
        ...(dto.completedAt !== undefined ? { completedAt: dto.completedAt ? new Date(dto.completedAt) : null } : {}),
        ...(dto.assignedToUserIds !== undefined ? { assignedToUserIds: dto.assignedToUserIds } : {}),
        tenantId, // mantiene coherencia
      },
    });
  }
}
