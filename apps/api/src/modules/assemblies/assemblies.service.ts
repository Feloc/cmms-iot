import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import {
  BlockAssemblyActivityDto,
  CompleteAssemblyActivityDto,
  CreateAssemblyDto,
  CreateAssemblyTemplateDto,
  UpdateAssemblyActivityDto,
  UpdateAssemblyTemplateDto,
  type AssemblyTemplateStepInput,
} from './dto/assemblies.dto';

const FINAL_ACTIVITY_STATUSES = new Set(['COMPLETED', 'NOT_APPLICABLE']);

@Injectable()
export class AssembliesService {
  constructor(private readonly prisma: PrismaService) {}

  private context() {
    const store = tenantStorage.getStore();
    if (!store?.tenantId || !store?.userId) throw new ForbiddenException('Contexto de usuario incompleto');
    return { tenantId: store.tenantId, userId: store.userId };
  }

  private async actor(tx: any, tenantId: string, userId: string) {
    const user = await tx.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, role: true, name: true },
    });
    if (!user) throw new ForbiddenException('Usuario no encontrado');
    return user;
  }

  private async requireAdmin(tx: any, tenantId: string, userId: string) {
    const user = await this.actor(tx, tenantId, userId);
    if (user.role !== 'ADMIN') throw new ForbiddenException('Se requiere rol ADMIN');
    return user;
  }

  private normalizeSteps(steps: AssemblyTemplateStepInput[] | undefined) {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new BadRequestException('La plantilla debe tener al menos una actividad');
    }
    return steps.map((step, index) => {
      const name = String(step?.name || '').trim();
      const estimatedMinutes = Math.round(Number(step?.estimatedMinutes));
      const plannedTechnicians = Math.round(Number(step?.plannedTechnicians ?? 1));
      if (!name) throw new BadRequestException(`La actividad ${index + 1} no tiene nombre`);
      if (!Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0) {
        throw new BadRequestException(`El tiempo estimado de "${name}" debe ser mayor que cero`);
      }
      if (!Number.isFinite(plannedTechnicians) || plannedTechnicians <= 0) {
        throw new BadRequestException(`La cantidad de técnicos de "${name}" debe ser mayor que cero`);
      }
      return {
        position: index + 1,
        phase: String(step.phase || '').trim() || null,
        name,
        instructions: String(step.instructions || '').trim() || null,
        estimatedMinutes,
        plannedTechnicians,
        required: step.required !== false,
        evidenceRequired: step.evidenceRequired === true,
      };
    });
  }

  async listTemplates(active?: string) {
    const { tenantId } = this.context();
    const where: any = { tenantId };
    if (active === 'true') where.active = true;
    if (active === 'false') where.active = false;
    return (this.prisma as any).assemblyTemplate.findMany({
      where,
      include: { steps: { orderBy: { position: 'asc' } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }, { version: 'desc' }],
    });
  }

  async createTemplate(dto: CreateAssemblyTemplateDto) {
    const { tenantId, userId } = this.context();
    const code = String(dto?.code || '').trim().toUpperCase();
    const name = String(dto?.name || '').trim();
    const version = Math.max(1, Math.round(Number(dto?.version ?? 1)));
    if (!code || !name) throw new BadRequestException('Código y nombre son obligatorios');
    const steps = this.normalizeSteps(dto?.steps);

    return this.prisma.$transaction(async (tx: any) => {
      await this.requireAdmin(tx, tenantId, userId);
      const duplicate = await tx.assemblyTemplate.findFirst({ where: { tenantId, code, version }, select: { id: true } });
      if (duplicate) throw new ConflictException(`Ya existe la plantilla ${code} versión ${version}`);
      return tx.assemblyTemplate.create({
        data: {
          tenantId,
          code,
          name,
          description: String(dto.description || '').trim() || null,
          brand: String(dto.brand || '').trim() || null,
          model: String(dto.model || '').trim() || null,
          version,
          active: dto.active !== false,
          steps: { create: steps.map((step) => ({ tenantId, ...step })) },
        },
        include: { steps: { orderBy: { position: 'asc' } } },
      });
    });
  }

  async updateTemplate(templateId: string, dto: UpdateAssemblyTemplateDto) {
    const { tenantId, userId } = this.context();
    return this.prisma.$transaction(async (tx: any) => {
      await this.requireAdmin(tx, tenantId, userId);
      const current = await tx.assemblyTemplate.findFirst({ where: { id: templateId, tenantId } });
      if (!current) throw new NotFoundException('Plantilla no encontrada');
      const data: any = {};
      if (dto.name !== undefined) {
        const name = String(dto.name || '').trim();
        if (!name) throw new BadRequestException('El nombre es obligatorio');
        data.name = name;
      }
      for (const key of ['description', 'brand', 'model'] as const) {
        if (dto[key] !== undefined) data[key] = String(dto[key] || '').trim() || null;
      }
      if (dto.active !== undefined) data.active = !!dto.active;
      if (dto.steps !== undefined) {
        const steps = this.normalizeSteps(dto.steps);
        data.steps = {
          deleteMany: {},
          create: steps.map((step) => ({ tenantId, ...step })),
        };
      }
      return tx.assemblyTemplate.update({
        where: { id: templateId },
        data,
        include: { steps: { orderBy: { position: 'asc' } } },
      });
    });
  }

  async create(dto: CreateAssemblyDto) {
    const { tenantId, userId } = this.context();
    const assetCode = String(dto?.assetCode || '').trim();
    const templateId = String(dto?.templateId || '').trim();
    if (!assetCode || !templateId) throw new BadRequestException('Activo y plantilla son obligatorios');

    return this.prisma.$transaction(async (tx: any) => {
      await this.requireAdmin(tx, tenantId, userId);
      const [asset, template] = await Promise.all([
        tx.asset.findFirst({ where: { tenantId, code: assetCode }, select: { code: true, name: true } }),
        tx.assemblyTemplate.findFirst({
          where: { tenantId, id: templateId, active: true },
          include: { steps: { orderBy: { position: 'asc' } } },
        }),
      ]);
      if (!asset) throw new NotFoundException('Activo no encontrado');
      if (!template) throw new NotFoundException('Plantilla activa no encontrada');
      if (!template.steps.length) throw new BadRequestException('La plantilla no tiene actividades');

      const technicianIds = Array.from(new Set((dto.technicianIds || []).map(String).filter(Boolean)));
      if (technicianIds.length) {
        const count = await tx.user.count({ where: { tenantId, id: { in: technicianIds }, role: { in: ['TECH', 'ADMIN'] } } });
        if (count !== technicianIds.length) throw new BadRequestException('Uno o más técnicos no son válidos');
      }
      const plannedMinutes = template.steps.reduce((sum: number, step: any) => sum + step.estimatedMinutes, 0);
      const plannedLaborMinutes = template.steps.reduce(
        (sum: number, step: any) => sum + step.estimatedMinutes * step.plannedTechnicians,
        0,
      );
      const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      if (dueDate && Number.isNaN(dueDate.getTime())) throw new BadRequestException('Fecha programada inválida');

      const workOrder = await tx.workOrder.create({
        data: {
          tenantId,
          assetCode,
          title: String(dto.title || '').trim() || `Montaje - ${asset.name}`,
          description: String(dto.description || '').trim() || null,
          kind: 'SERVICE_ORDER',
          serviceOrderType: 'MONTAJE',
          status: dueDate ? 'SCHEDULED' : 'OPEN',
          commercialStatus: 'PROGRAMMED',
          dueDate,
          durationMin: plannedMinutes,
          assignments: technicianIds.length
            ? { create: technicianIds.map((id) => ({ tenantId, userId: id, role: 'TECHNICIAN', state: 'ACTIVE' })) }
            : undefined,
        },
      });

      const execution = await tx.assemblyExecution.create({
        data: {
          tenantId,
          workOrderId: workOrder.id,
          templateId: template.id,
          templateCode: template.code,
          templateName: template.name,
          templateVersion: template.version,
          plannedMinutes,
          plannedLaborMinutes,
          activities: {
            create: template.steps.map((step: any) => ({
              tenantId,
              templateStepId: step.id,
              position: step.position,
              phase: step.phase,
              name: step.name,
              instructions: step.instructions,
              estimatedMinutes: step.estimatedMinutes,
              plannedTechnicians: step.plannedTechnicians,
              required: step.required,
              evidenceRequired: step.evidenceRequired,
            })),
          },
        },
      });
      return { id: execution.id, workOrderId: workOrder.id };
    });
  }

  async list(status?: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    const where: any = { tenantId };
    if (status) where.status = String(status).toUpperCase();
    if (actor.role === 'TECH') {
      where.workOrder = { assignments: { some: { userId, state: 'ACTIVE' } } };
    }
    const rows = await (this.prisma as any).assemblyExecution.findMany({
      where,
      include: {
        activities: { include: { workLogs: true }, orderBy: { position: 'asc' } },
        workOrder: {
          include: { assignments: { where: { state: 'ACTIVE' }, include: { user: { select: { id: true, name: true } } } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const assetCodes: string[] = Array.from(new Set<string>(rows.map((row: any) => String(row.workOrder.assetCode))));
    const assets = await this.prisma.asset.findMany({
      where: { tenantId, code: { in: assetCodes } },
      select: { code: true, name: true, customer: true, brand: true, model: true, serialNumber: true },
    });
    const assetByCode = new Map(assets.map((asset) => [asset.code, asset]));
    return rows.map((row: any) => this.serialize(row, assetByCode.get(row.workOrder.assetCode) || null));
  }

  async get(id: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    const execution = await (this.prisma as any).assemblyExecution.findFirst({
      where: { id, tenantId },
      include: {
        activities: { include: { workLogs: { orderBy: { startedAt: 'asc' } } }, orderBy: { position: 'asc' } },
        workOrder: {
          include: { assignments: { where: { state: 'ACTIVE' }, include: { user: { select: { id: true, name: true, email: true } } } } },
        },
      },
    });
    if (!execution) throw new NotFoundException('Montaje no encontrado');
    if (actor.role === 'TECH' && !execution.workOrder.assignments.some((a: any) => a.userId === userId)) {
      throw new ForbiddenException('No estás asignado a este montaje');
    }
    const asset = await this.prisma.asset.findFirst({
      where: { tenantId, code: execution.workOrder.assetCode },
      select: { id: true, code: true, name: true, customer: true, brand: true, model: true, serialNumber: true },
    });
    const userIds: string[] = Array.from(
      new Set<string>(execution.activities.flatMap((activity: any) => activity.workLogs.map((log: any) => String(log.userId)))),
    );
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { tenantId, id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));
    for (const activity of execution.activities) {
      activity.workLogs = activity.workLogs.map((log: any) => ({ ...log, user: userById.get(log.userId) || null }));
    }
    return this.serialize(execution, asset);
  }

  private activityActualMinutes(activity: any, now = new Date()) {
    return Math.max(0, Math.round((activity.workLogs || []).reduce((sum: number, log: any) => {
      const start = new Date(log.startedAt).getTime();
      const end = log.endedAt ? new Date(log.endedAt).getTime() : now.getTime();
      return sum + Math.max(0, end - start) / 60000;
    }, 0)));
  }

  private serialize(execution: any, asset: any) {
    const now = new Date();
    let earnedMinutes = 0;
    let actualLaborMinutes = 0;
    const activities = execution.activities.map((activity: any) => {
      const actualMinutes = this.activityActualMinutes(activity, now);
      actualLaborMinutes += actualMinutes;
      const progress = FINAL_ACTIVITY_STATUSES.has(activity.status) ? 100 : Math.max(0, Math.min(100, activity.progressPercent || 0));
      earnedMinutes += activity.estimatedMinutes * activity.plannedTechnicians * (progress / 100);
      return {
        ...activity,
        actualMinutes,
        varianceMinutes: actualMinutes - activity.estimatedMinutes * activity.plannedTechnicians,
      };
    });
    const plannedLaborMinutes = Math.max(0, execution.plannedLaborMinutes || 0);
    const progressPercent = plannedLaborMinutes > 0 ? Math.round((earnedMinutes / plannedLaborMinutes) * 100) : 0;
    const budgetConsumedPercent = plannedLaborMinutes > 0 ? Math.round((actualLaborMinutes / plannedLaborMinutes) * 100) : 0;
    const forecastLaborMinutes = progressPercent > 0
      ? Math.round(actualLaborMinutes / (progressPercent / 100))
      : plannedLaborMinutes;
    return {
      ...execution,
      asset,
      activities,
      metrics: { progressPercent, actualLaborMinutes, budgetConsumedPercent, forecastLaborMinutes },
    };
  }

  private async activityContext(tx: any, id: string, activityId: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(tx, tenantId, userId);
    const execution = await tx.assemblyExecution.findFirst({
      where: { id, tenantId },
      include: {
        workOrder: { include: { assignments: { where: { state: 'ACTIVE' } } } },
        activities: { orderBy: { position: 'asc' } },
      },
    });
    if (!execution) throw new NotFoundException('Montaje no encontrado');
    const activity = execution.activities.find((item: any) => item.id === activityId);
    if (!activity) throw new NotFoundException('Actividad no encontrada');
    const assigned = execution.workOrder.assignments.some((item: any) => item.userId === userId);
    if (actor.role !== 'ADMIN' && (actor.role !== 'TECH' || !assigned)) {
      throw new ForbiddenException('No estás asignado a este montaje');
    }
    if (['COMPLETED', 'CANCELED'].includes(execution.status)) throw new ConflictException('El montaje ya está cerrado');
    return { tenantId, userId, actor, execution, activity };
  }

  async startActivity(id: string, activityId: string) {
    await this.prisma.$transaction(async (tx: any) => {
      const ctx = await this.activityContext(tx, id, activityId);
      if (ctx.activity.status === 'COMPLETED' || ctx.activity.status === 'NOT_APPLICABLE') {
        throw new ConflictException('La actividad ya está terminada');
      }
      const pendingPrevious = ctx.execution.activities.find(
        (item: any) => item.position < ctx.activity.position && item.required && !FINAL_ACTIVITY_STATUSES.has(item.status),
      );
      if (pendingPrevious) throw new ConflictException(`Primero debes completar: ${pendingPrevious.name}`);
      const otherOpen = await tx.workLog.findFirst({
        where: { tenantId: ctx.tenantId, userId: ctx.userId, endedAt: null },
        include: { workOrder: { select: { title: true } } },
      });
      if (otherOpen && otherOpen.assemblyActivityId !== activityId) {
        throw new ConflictException(`Ya tienes un trabajo abierto en ${otherOpen.workOrder?.title || 'otra orden'}`);
      }
      if (!otherOpen) {
        await tx.workLog.create({
          data: {
            tenantId: ctx.tenantId,
            workOrderId: ctx.execution.workOrderId,
            assemblyActivityId: activityId,
            userId: ctx.userId,
            startedAt: new Date(),
            note: 'ASSEMBLY_ACTIVITY',
          },
        });
      }
      const now = new Date();
      await tx.assemblyActivity.update({
        where: { id: activityId },
        data: { status: 'IN_PROGRESS', blockedReason: null, startedAt: ctx.activity.startedAt || now },
      });
      await tx.assemblyExecution.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: ctx.execution.startedAt || now } });
      await tx.workOrder.update({
        where: { id: ctx.execution.workOrderId },
        data: { status: 'IN_PROGRESS', startedAt: ctx.execution.workOrder.startedAt || now, activityStartedAt: ctx.execution.workOrder.activityStartedAt || now },
      });
    });
    return this.get(id);
  }

  async pauseActivity(id: string, activityId: string) {
    await this.prisma.$transaction(async (tx: any) => {
      const ctx = await this.activityContext(tx, id, activityId);
      const now = new Date();
      await tx.workLog.updateMany({
        where: { tenantId: ctx.tenantId, assemblyActivityId: activityId, userId: ctx.userId, endedAt: null },
        data: { endedAt: now },
      });
      const remaining = await tx.workLog.count({ where: { tenantId: ctx.tenantId, assemblyActivityId: activityId, endedAt: null } });
      if (!remaining) await tx.assemblyActivity.update({ where: { id: activityId }, data: { status: 'PAUSED' } });
      await this.syncExecution(tx, ctx.execution);
    });
    return this.get(id);
  }

  async blockActivity(id: string, activityId: string, dto: BlockAssemblyActivityDto) {
    const reason = String(dto?.reason || '').trim();
    if (!reason) throw new BadRequestException('Debes indicar el motivo del bloqueo');
    await this.prisma.$transaction(async (tx: any) => {
      const ctx = await this.activityContext(tx, id, activityId);
      await tx.workLog.updateMany({
        where: { tenantId: ctx.tenantId, assemblyActivityId: activityId, endedAt: null },
        data: { endedAt: new Date() },
      });
      await tx.assemblyActivity.update({
        where: { id: activityId },
        data: { status: 'BLOCKED', blockedReason: reason, notes: dto.notes === undefined ? ctx.activity.notes : String(dto.notes || '').trim() || null },
      });
      await this.syncExecution(tx, ctx.execution);
    });
    return this.get(id);
  }

  async completeActivity(id: string, activityId: string, dto: CompleteAssemblyActivityDto) {
    await this.prisma.$transaction(async (tx: any) => {
      const ctx = await this.activityContext(tx, id, activityId);
      if (ctx.activity.status === 'PENDING') {
        throw new BadRequestException('Debes iniciar la actividad antes de completarla');
      }
      const now = new Date();
      await tx.workLog.updateMany({
        where: { tenantId: ctx.tenantId, assemblyActivityId: activityId, endedAt: null },
        data: { endedAt: now },
      });
      await tx.assemblyActivity.update({
        where: { id: activityId },
        data: {
          status: 'COMPLETED',
          progressPercent: 100,
          completedAt: now,
          completedByUserId: ctx.userId,
          blockedReason: null,
          notes: dto.notes === undefined ? ctx.activity.notes : String(dto.notes || '').trim() || null,
        },
      });
      await this.syncExecution(tx, ctx.execution);
    });
    return this.get(id);
  }

  async updateActivity(id: string, activityId: string, dto: UpdateAssemblyActivityDto) {
    await this.prisma.$transaction(async (tx: any) => {
      const ctx = await this.activityContext(tx, id, activityId);
      const data: any = {};
      if (dto.progressPercent !== undefined) {
        const value = Math.round(Number(dto.progressPercent));
        if (!Number.isFinite(value) || value < 0 || value > 100) throw new BadRequestException('El avance debe estar entre 0 y 100');
        data.progressPercent = value;
      }
      if (dto.notes !== undefined) data.notes = String(dto.notes || '').trim() || null;
      if (dto.assignedUserId !== undefined) {
        if (ctx.actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede cambiar el responsable');
        data.assignedUserId = dto.assignedUserId || null;
      }
      if (Object.keys(data).length) await tx.assemblyActivity.update({ where: { id: activityId }, data });
    });
    return this.get(id);
  }

  private async syncExecution(tx: any, execution: any) {
    const activities = await tx.assemblyActivity.findMany({ where: { tenantId: execution.tenantId, executionId: execution.id } });
    const allDone = activities.length > 0 && activities.every((item: any) => FINAL_ACTIVITY_STATUSES.has(item.status));
    const hasActive = activities.some((item: any) => item.status === 'IN_PROGRESS');
    const hasStarted = activities.some((item: any) => item.startedAt || item.status !== 'PENDING');
    const now = new Date();
    const status = allDone ? 'COMPLETED' : hasActive ? 'IN_PROGRESS' : hasStarted ? 'ON_HOLD' : 'PLANNED';
    await tx.assemblyExecution.update({
      where: { id: execution.id },
      data: { status, completedAt: allDone ? now : null },
    });
    await tx.workOrder.update({
      where: { id: execution.workOrderId },
      data: allDone
        ? { status: 'COMPLETED', completedAt: now, activityFinishedAt: now, commercialStatus: 'COMPLETED' }
        : { status: status === 'IN_PROGRESS' ? 'IN_PROGRESS' : hasStarted ? 'ON_HOLD' : execution.workOrder.status },
    });
  }
}
