import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { manufacturingControl } from './manufacturing-control.domain';

@Injectable()
export class ManufacturingControlService {
  constructor(private readonly prisma: PrismaService) {}
  private async where() {
    const { tenantId, userId } = tenantStorage.getStore() || {};
    if (!tenantId || !userId) throw new ForbiddenException('Contexto incompleto');
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { role: true } });
    if (!user) throw new ForbiddenException('Usuario no encontrado');
    return { tenantId, ...(user.role === 'TECH' ? { OR: [{ responsibleUserId: userId }, { members: { some: { userId, tenantId } } }] } : {}) };
  }
  private include() {
    return {
      responsibleUser: { select: { name: true } }, units: { select: { id: true, unitNumber: true, status: true } },
      engineeringReleases: { select: { status: true } },
      supplyPlans: { where: { status: { in: ['ACTIVE', 'COMPLETED'] } }, select: { requirements: { select: { included: true, status: true, expectedAt: true } } } },
      kits: { select: { id: true, manufacturedUnitId: true, status: true } },
      assemblyExecutions: { select: { kitId: true, status: true, operations: { select: { status: true, blockedReason: true } } } },
      fatExecutions: { select: { manufacturedUnitId: true, status: true, sequence: true, deviations: { select: { status: true } } } },
      dispatches: { select: { manufacturedUnitId: true, status: true } },
      siteDeployments: { select: { manufacturedUnitId: true, status: true, assemblyExecutionId: true } },
      satExecutions: { select: { manufacturedUnitId: true, status: true, sequence: true, deviations: { select: { status: true, dueAt: true } } } },
      handovers: { select: { manufacturedUnitId: true, status: true, documents: { select: { required: true, status: true } } } },
      outputReceipts: { select: { quantity: true } }, quickExecution: { select: { state: true } },
    };
  }
  async list(query: { page?: string; q?: string; closed?: string }) {
    const page = Number(query.page || 1);
    if (!Number.isInteger(page) || page < 1) throw new BadRequestException('Página inválida');
    const visibility = await this.where();
    const where = { AND: [visibility, ...(query.closed === 'true' ? [] : [{ status: { notIn: ['COMPLETED', 'CANCELED'] } }]), ...(query.q?.trim() ? [{ OR: [{ number: { contains: query.q.trim(), mode: 'insensitive' } }, { projectName: { contains: query.q.trim(), mode: 'insensitive' } }] }] : [])] };
    const db = this.prisma as any;
    const [rows, total] = await db.$transaction([db.manufacturingOrder.findMany({ where, include: this.include(), take: 25, skip: (page - 1) * 25, orderBy: [{ requestedDeliveryAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }] }), db.manufacturingOrder.count({ where })], { isolationLevel: 'RepeatableRead' });
    const now = new Date();
    return { items: rows.map((row: any) => manufacturingControl(row, now)), total, page, pages: Math.max(1, Math.ceil(total / 25)) };
  }
  async get(id: string) {
    const row = await (this.prisma as any).manufacturingOrder.findFirst({ where: { id, ...await this.where() }, include: this.include() });
    if (!row) throw new NotFoundException('Orden no encontrada');
    return manufacturingControl(row);
  }
}
