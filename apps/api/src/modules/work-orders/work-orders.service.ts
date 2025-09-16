import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { AddAssignmentDto, UpdateAssignmentDto } from './dto/assignment.dto';
import { StartWorkDto, PauseWorkDto, StopWorkDto } from './dto/worklog.dto';


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

  findOne(id: string) {
    const tenantId = this.getTenantId();
    return this.prisma.workOrder.findFirst({
      where: { id, tenantId },
      include: {
        assignments: true, // si quieres incluir user info, debes tener relación User; si no, deja IDs
        workLog: true,
      },
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
        tenantId, // mantiene coherencia
      },
    });
  }

  private async ensureWO(id: string, tenantId: string) {
    const wo = await this.prisma.workOrder.findFirst({ where: { id, tenantId } });
    if (!wo) throw new Error('WO not found');
    return wo;
  }

  async addAssignment(woId: string, dto: AddAssignmentDto) {
    const tenantId = this.getTenantId();
    await this.ensureWO(woId, tenantId);
    const existing = await this.prisma.wOAssignment.findFirst({
      where: { workOrderId: woId, userId: dto.userId, state: 'ACTIVE', tenantId },
    });
    if (existing) return existing; // idempotente
    return this.prisma.wOAssignment.create({
      data: { tenantId, workOrderId: woId, userId: dto.userId, role: dto.role, state: 'ACTIVE' },
    });
  }

  async updateAssignment(woId: string, assignmentId: string, dto: UpdateAssignmentDto) {
    const tenantId = this.getTenantId();
    await this.ensureWO(woId, tenantId);
    // opcional: validar que el assignment pertenece al mismo tenant
    return this.prisma.wOAssignment.update({
      where: { id: assignmentId },
      data: { state: dto.state, note: dto.note },
    });
  }

   private getUserId(): string {
    const s = tenantStorage.getStore();
    if (!s?.userId) throw new Error('No user in context');
    return s.userId;
  }

  async startWork(woId: string, dto: StartWorkDto) {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();
    await this.ensureWO(woId, tenantId);
    const open = await this.prisma.workLog.findFirst({ where: { tenantId, workOrderId: woId, userId, endedAt: null } });
    if (open) return open; // idempotente
    return this.prisma.workLog.create({
      data: { tenantId, workOrderId: woId, userId, startedAt: new Date(), note: dto.note, source: 'MANUAL' },
    });
  }

  async pauseWork(woId: string, dto: PauseWorkDto) {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();
    await this.ensureWO(woId, tenantId);
    const open = await this.prisma.workLog.findFirst({
      where: { tenantId, workOrderId: woId, userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!open) throw new Error('No open work log');
    return this.prisma.workLog.update({
      where: { id: open.id },
      data: { endedAt: new Date(), note: dto.note ?? open.note },
    });
  }

  async stopWork(woId: string, dto: StopWorkDto) {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();
    await this.ensureWO(woId, tenantId);
    const open = await this.prisma.workLog.findFirst({
      where: { tenantId, workOrderId: woId, userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (open) {
      return this.prisma.workLog.update({
        where: { id: open.id },
        data: { endedAt: new Date(), note: dto.note ?? open.note },
      });
    }
    const now = new Date();
    return this.prisma.workLog.create({
      data: { tenantId, workOrderId: woId, userId, startedAt: now, endedAt: now, note: dto.note, source: 'MANUAL' },
    });
  }
}
