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
  UpdateAssemblyOperationalAlertDto,
  UpdateAssemblyScheduleDto,
  UpdateAssemblyTemplateDto,
  UpdateAssemblySignaturesDto,
  type AssemblyTemplateStepInput,
} from './dto/assemblies.dto';

const FINAL_ACTIVITY_STATUSES = new Set(['COMPLETED', 'NOT_APPLICABLE']);

type WorkCalendar = {
  timezone: string;
  startMinute: number;
  endMinute: number;
  workingDays: number[];
  excludedDates: string[];
};

type WorkCalendarInput = {
  scheduleTimezone?: string;
  workdayStartMinute?: number;
  workdayEndMinute?: number;
  workingDays?: number[];
  excludedDates?: string[];
};

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
      const rawDependencies = step.dependsOnPositions === undefined
        ? (index > 0 ? [index] : [])
        : step.dependsOnPositions;
      if (!Array.isArray(rawDependencies)) {
        throw new BadRequestException(`Las dependencias de "${name}" no son válidas`);
      }
      const dependsOnPositions = Array.from(new Set(rawDependencies.map(Number))).sort((a, b) => a - b);
      if (dependsOnPositions.some((position) => !Number.isInteger(position) || position < 1 || position > index)) {
        throw new BadRequestException(`"${name}" solo puede depender de actividades anteriores`);
      }
      return {
        position: index + 1,
        phase: String(step.phase || '').trim() || null,
        name,
        instructions: String(step.instructions || '').trim() || null,
        estimatedMinutes,
        plannedTechnicians,
        dependsOnPositions,
        required: step.required !== false,
        evidenceRequired: step.evidenceRequired === true,
      };
    });
  }

  private scheduleConfig(dto: WorkCalendarInput): WorkCalendar {
    const timezone = String(dto.scheduleTimezone || 'America/Bogota').trim();
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
      throw new BadRequestException('Zona horaria inválida');
    }
    const startMinute = Math.round(Number(dto.workdayStartMinute ?? 480));
    const endMinute = Math.round(Number(dto.workdayEndMinute ?? 1020));
    if (startMinute < 0 || endMinute > 1440 || endMinute <= startMinute) {
      throw new BadRequestException('El horario laboral no es válido');
    }
    const workingDays = Array.from(new Set((dto.workingDays ?? [1, 2, 3, 4, 5]).map(Number))).sort();
    if (!workingDays.length || workingDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new BadRequestException('Los días laborales no son válidos');
    }
    const excludedDates = Array.from(new Set((dto.excludedDates || []).map(String).map((date) => date.trim()).filter(Boolean)));
    if (excludedDates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
      throw new BadRequestException('Las fechas no laborables deben usar el formato AAAA-MM-DD');
    }
    return { timezone, startMinute, endMinute, workingDays, excludedDates };
  }

  private calendarFromExecution(execution: any): WorkCalendar {
    return {
      timezone: execution.scheduleTimezone || 'America/Bogota',
      startMinute: Number(execution.workdayStartMinute ?? 480),
      endMinute: Number(execution.workdayEndMinute ?? 1020),
      workingDays: Array.isArray(execution.workingDays) ? execution.workingDays.map(Number) : [1, 2, 3, 4, 5],
      excludedDates: Array.isArray(execution.excludedDates) ? execution.excludedDates.map(String) : [],
    };
  }

  private zonedParts(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
    return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') };
  }

  private zonedDate(year: number, month: number, day: number, minuteOfDay: number, timezone: string) {
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const target = Date.UTC(year, month - 1, day, hour, minute);
    let timestamp = target;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = this.zonedParts(new Date(timestamp), timezone);
      const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
      timestamp += target - represented;
    }
    return new Date(timestamp);
  }

  private nextCalendarDate(year: number, month: number, day: number) {
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
  }

  private normalizeWorkingInstant(value: Date, calendar: WorkCalendar) {
    let candidate = new Date(value);
    const excluded = new Set(calendar.excludedDates);
    for (let attempt = 0; attempt < 3700; attempt += 1) {
      const parts = this.zonedParts(candidate, calendar.timezone);
      const key = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
      const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
      const minute = parts.hour * 60 + parts.minute;
      if (calendar.workingDays.includes(weekday) && !excluded.has(key)) {
        if (minute < calendar.startMinute) return this.zonedDate(parts.year, parts.month, parts.day, calendar.startMinute, calendar.timezone);
        if (minute < calendar.endMinute) return candidate;
      }
      const next = this.nextCalendarDate(parts.year, parts.month, parts.day);
      candidate = this.zonedDate(next.year, next.month, next.day, calendar.startMinute, calendar.timezone);
    }
    throw new BadRequestException('No fue posible calcular el calendario laboral');
  }

  private addWorkingMinutes(start: Date, minutes: number, calendar: WorkCalendar) {
    let cursor = this.normalizeWorkingInstant(start, calendar);
    let remaining = Math.max(1, Math.round(minutes));
    while (remaining > 0) {
      const parts = this.zonedParts(cursor, calendar.timezone);
      const workdayEnd = this.zonedDate(parts.year, parts.month, parts.day, calendar.endMinute, calendar.timezone);
      const available = Math.max(0, Math.round((workdayEnd.getTime() - cursor.getTime()) / 60_000));
      if (remaining <= available) return new Date(cursor.getTime() + remaining * 60_000);
      remaining -= available;
      cursor = this.normalizeWorkingInstant(new Date(workdayEnd.getTime() + 60_000), calendar);
    }
    return cursor;
  }

  private buildSchedule(activities: any[], requestedStart: Date, calendar: WorkCalendar) {
    const baseStart = this.normalizeWorkingInstant(requestedStart, calendar);
    const byPosition = new Map<number, { start: Date; end: Date }>();
    for (const activity of [...activities].sort((a, b) => a.position - b.position)) {
      const dependencies = Array.isArray(activity.dependsOnPositions) ? activity.dependsOnPositions.map(Number) : [];
      const dependencyEnds = dependencies.map((position: number) => byPosition.get(position)?.end).filter(Boolean) as Date[];
      const earliest = dependencyEnds.length
        ? new Date(Math.max(...dependencyEnds.map((date) => date.getTime())))
        : baseStart;
      const start = this.normalizeWorkingInstant(earliest, calendar);
      const end = this.addWorkingMinutes(start, activity.estimatedMinutes, calendar);
      byPosition.set(activity.position, { start, end });
    }
    const entries = Array.from(byPosition.values());
    return {
      byPosition,
      start: entries.length ? new Date(Math.min(...entries.map((item) => item.start.getTime()))) : baseStart,
      end: entries.length ? new Date(Math.max(...entries.map((item) => item.end.getTime()))) : baseStart,
    };
  }

  private criticalPathMinutes(steps: any[]) {
    const finishByPosition = new Map<number, number>();
    for (const step of [...steps].sort((a, b) => a.position - b.position)) {
      const dependencies = Array.isArray(step.dependsOnPositions) ? step.dependsOnPositions.map(Number) : [];
      const predecessorFinish = dependencies.length
        ? Math.max(...dependencies.map((position: number) => finishByPosition.get(position) || 0))
        : 0;
      finishByPosition.set(step.position, predecessorFinish + Math.max(1, Number(step.estimatedMinutes || 0)));
    }
    return Math.max(0, ...finishByPosition.values());
  }

  private async syncPersistentAlerts(assembly: any) {
    const now = new Date();
    const fallbackAssignee = assembly.workOrder?.assignments?.[0]?.userId || null;
    const desired = new Map<string, { activityId: string | null; code: string; severity: string; message: string; assignedUserId: string | null }>();
    for (const activity of assembly.activities || []) {
      for (const alert of activity.alerts || []) {
        const fingerprint = `${assembly.id}:${activity.id}:${alert.code}`;
        desired.set(fingerprint, {
          activityId: activity.id,
          code: alert.code,
          severity: alert.severity,
          message: `${activity.name}: ${alert.message}`,
          assignedUserId: activity.assignedUserId || fallbackAssignee,
        });
      }
    }
    for (const alert of assembly.operationalAlerts || []) {
      if (!['LABOR_RISK', 'PENDING_SIGNATURE'].includes(alert.code)) continue;
      const fingerprint = `${assembly.id}:EXECUTION:${alert.code}`;
      desired.set(fingerprint, { activityId: null, code: alert.code, severity: alert.severity, message: alert.message, assignedUserId: fallbackAssignee });
    }

    const existing = await (this.prisma as any).assemblyOperationalAlert.findMany({ where: { tenantId: assembly.tenantId, executionId: assembly.id } });
    const existingByFingerprint = new Map(existing.map((alert: any) => [alert.fingerprint, alert]));
    for (const [fingerprint, alert] of desired) {
      const current: any = existingByFingerprint.get(fingerprint);
      if (!current) {
        await (this.prisma as any).assemblyOperationalAlert.create({
          data: { tenantId: assembly.tenantId, executionId: assembly.id, fingerprint, ...alert, firstDetectedAt: now, lastDetectedAt: now },
        });
        continue;
      }
      const recurring = current.status === 'RESOLVED';
      const ageMinutes = recurring ? 0 : Math.max(0, (now.getTime() - new Date(current.firstDetectedAt).getTime()) / 60_000);
      const escalationLevel = current.status === 'OPEN' ? (ageMinutes >= 120 ? 2 : ageMinutes >= 30 ? 1 : 0) : current.escalationLevel;
      await (this.prisma as any).assemblyOperationalAlert.update({
        where: { id: current.id },
        data: {
          code: alert.code,
          severity: alert.severity,
          message: alert.message,
          lastDetectedAt: now,
          assignedUserId: current.assignedUserId || alert.assignedUserId,
          ...(recurring ? {
            status: 'OPEN', firstDetectedAt: now, resolvedAt: null, acknowledgedAt: null,
            acknowledgedById: null, acknowledgedByName: null, escalationLevel: 0, escalatedAt: null,
          } : escalationLevel > current.escalationLevel ? { escalationLevel, escalatedAt: now } : {}),
        },
      });
    }
    for (const alert of existing) {
      if (!desired.has(alert.fingerprint) && alert.status !== 'RESOLVED') {
        await (this.prisma as any).assemblyOperationalAlert.update({ where: { id: alert.id }, data: { status: 'RESOLVED', resolvedAt: now } });
      }
    }
    return (this.prisma as any).assemblyOperationalAlert.findMany({
      where: { tenantId: assembly.tenantId, executionId: assembly.id, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      orderBy: [{ escalationLevel: 'desc' }, { severity: 'asc' }, { firstDetectedAt: 'asc' }],
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
      if (dto.active !== false) {
        await tx.assemblyTemplate.updateMany({ where: { tenantId, code, active: true }, data: { active: false } });
      }
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
    return this.prisma.$transaction(async (tx: any) => {
      await this.requireAdmin(tx, tenantId, userId);
      return this.createForAsset(tx, tenantId, dto);
    });
  }

  /** Reutiliza el motor de Montajes dentro de una transacción iniciada por otro módulo. */
  async createForAsset(tx: any, tenantId: string, dto: CreateAssemblyDto) {
      const assetCode = String(dto?.assetCode || '').trim();
      const templateId = String(dto?.templateId || '').trim();
      if (!assetCode || !templateId) throw new BadRequestException('Activo y plantilla son obligatorios');
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
      const plannedMinutes = this.criticalPathMinutes(template.steps);
      const plannedLaborMinutes = template.steps.reduce(
        (sum: number, step: any) => sum + step.estimatedMinutes * step.plannedTechnicians,
        0,
      );
      const scheduleStartValue = dto.scheduledStartAt ?? dto.dueDate;
      const scheduledStartAt = scheduleStartValue ? new Date(scheduleStartValue) : null;
      if (scheduledStartAt && Number.isNaN(scheduledStartAt.getTime())) throw new BadRequestException('Fecha de inicio inválida');
      const calendar = this.scheduleConfig(dto);
      const plannedSchedule = scheduledStartAt ? this.buildSchedule(template.steps, scheduledStartAt, calendar) : null;
      const dueDate = plannedSchedule?.end || null;

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
          scheduledStartAt,
          scheduleTimezone: calendar.timezone,
          workdayStartMinute: calendar.startMinute,
          workdayEndMinute: calendar.endMinute,
          workingDays: calendar.workingDays,
          excludedDates: calendar.excludedDates,
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
              dependsOnPositions: step.dependsOnPositions,
              required: step.required,
              evidenceRequired: step.evidenceRequired,
            })),
          },
        },
      });
      return { id: execution.id, workOrderId: workOrder.id };
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
    const serializedRows = rows.map((row: any) => this.serialize(row, assetByCode.get(row.workOrder.assetCode) || null));
    for (const assembly of serializedRows) assembly.persistentAlerts = await this.syncPersistentAlerts(assembly);
    return serializedRows;
  }

  async get(id: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    const execution = await (this.prisma as any).assemblyExecution.findFirst({
      where: { id, tenantId },
      include: {
        scheduleRevisions: { orderBy: { version: 'desc' } },
        activities: {
          include: {
            workLogs: { orderBy: { startedAt: 'asc' } },
            attachments: {
              select: { id: true, type: true, filename: true, mimeType: true, size: true, createdBy: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { position: 'asc' },
        },
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
    const serialized = this.serialize(execution, asset);
    serialized.persistentAlerts = await this.syncPersistentAlerts(serialized);
    return serialized;
  }

  private scheduleSnapshot(execution: any, schedule: { byPosition: Map<number, { start: Date; end: Date }>; start: Date; end: Date }) {
    return {
      scheduledStartAt: execution.scheduledStartAt ? new Date(execution.scheduledStartAt).toISOString() : null,
      scheduleTimezone: execution.scheduleTimezone,
      workdayStartMinute: execution.workdayStartMinute,
      workdayEndMinute: execution.workdayEndMinute,
      workingDays: execution.workingDays,
      excludedDates: execution.excludedDates,
      plannedMinutes: execution.plannedMinutes,
      plannedLaborMinutes: execution.plannedLaborMinutes,
      baselineStartAt: schedule.start.toISOString(),
      baselineEndAt: schedule.end.toISOString(),
      activities: execution.activities.map((activity: any) => {
        const planned = schedule.byPosition.get(activity.position);
        return {
          id: activity.id,
          position: activity.position,
          name: activity.name,
          estimatedMinutes: activity.estimatedMinutes,
          plannedTechnicians: activity.plannedTechnicians,
          dependsOnPositions: activity.dependsOnPositions,
          plannedStartAt: planned?.start.toISOString() || null,
          plannedEndAt: planned?.end.toISOString() || null,
        };
      }),
    };
  }

  async listOperationalAlerts(status?: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    await this.list();
    const where: any = { tenantId };
    if (status) {
      const normalized = String(status).toUpperCase();
      if (!['OPEN', 'ACKNOWLEDGED', 'RESOLVED'].includes(normalized)) throw new BadRequestException('Estado de alerta inválido');
      where.status = normalized;
    } else {
      where.status = { in: ['OPEN', 'ACKNOWLEDGED'] };
    }
    if (actor.role === 'TECH') {
      where.OR = [
        { assignedUserId: userId },
        { execution: { workOrder: { assignments: { some: { userId, state: 'ACTIVE' } } } } },
      ];
    }
    return (this.prisma as any).assemblyOperationalAlert.findMany({
      where,
      include: {
        activity: { select: { id: true, position: true, name: true } },
        execution: { select: { id: true, workOrder: { select: { id: true, title: true, assetCode: true } } } },
      },
      orderBy: [{ escalationLevel: 'desc' }, { firstDetectedAt: 'asc' }],
      take: String(status || '').toUpperCase() === 'RESOLVED' ? 100 : undefined,
    });
  }

  async updateOperationalAlert(alertId: string, dto: UpdateAssemblyOperationalAlertDto) {
    const { tenantId, userId } = this.context();
    return this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const alert = await tx.assemblyOperationalAlert.findFirst({
        where: { id: alertId, tenantId },
        include: { execution: { include: { workOrder: { include: { assignments: { where: { state: 'ACTIVE' } } } } } } },
      });
      if (!alert) throw new NotFoundException('Alerta operativa no encontrada');
      const assignedToWorkOrder = alert.execution.workOrder.assignments.some((assignment: any) => assignment.userId === userId);
      if (actor.role !== 'ADMIN' && alert.assignedUserId !== userId && !assignedToWorkOrder) {
        throw new ForbiddenException('No puedes gestionar esta alerta');
      }
      const data: any = {};
      if (dto.assignedUserId !== undefined) {
        if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede asignar alertas');
        if (dto.assignedUserId) {
          const assignee = await tx.user.findFirst({ where: { tenantId, id: dto.assignedUserId, role: { in: ['TECH', 'ADMIN'] } }, select: { id: true } });
          if (!assignee) throw new BadRequestException('Responsable no válido');
        }
        data.assignedUserId = dto.assignedUserId || null;
      }
      if (dto.acknowledge !== undefined) {
        if (dto.acknowledge) {
          if (alert.status === 'RESOLVED') throw new ConflictException('La alerta ya está resuelta');
          data.status = 'ACKNOWLEDGED';
          data.acknowledgedAt = new Date();
          data.acknowledgedById = userId;
          data.acknowledgedByName = actor.name;
        } else {
          if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede reabrir la atención');
          data.status = 'OPEN';
          data.acknowledgedAt = null;
          data.acknowledgedById = null;
          data.acknowledgedByName = null;
        }
      }
      if (!Object.keys(data).length) throw new BadRequestException('No hay cambios para aplicar');
      return tx.assemblyOperationalAlert.update({ where: { id: alertId }, data });
    });
  }

  async updateSchedule(id: string, dto: UpdateAssemblyScheduleDto) {
    const { tenantId, userId } = this.context();
    const reason = String(dto?.reason || '').trim();
    if (!reason) throw new BadRequestException('Debes indicar el motivo de la reprogramación');

    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.requireAdmin(tx, tenantId, userId);
      const execution = await tx.assemblyExecution.findFirst({
        where: { id, tenantId },
        include: { activities: { orderBy: { position: 'asc' } }, workOrder: true },
      });
      if (!execution) throw new NotFoundException('Montaje no encontrado');
      if (['COMPLETED', 'CANCELED'].includes(execution.status)) {
        throw new ConflictException('No se puede reprogramar un montaje cerrado');
      }

      const scheduledStartAt = new Date(dto.scheduledStartAt);
      if (Number.isNaN(scheduledStartAt.getTime())) throw new BadRequestException('Fecha de inicio inválida');
      const calendar = this.scheduleConfig({
        ...dto,
        scheduleTimezone: dto.scheduleTimezone ?? execution.scheduleTimezone,
        workdayStartMinute: dto.workdayStartMinute ?? execution.workdayStartMinute,
        workdayEndMinute: dto.workdayEndMinute ?? execution.workdayEndMinute,
        workingDays: dto.workingDays ?? execution.workingDays,
        excludedDates: dto.excludedDates ?? execution.excludedDates,
      });

      if (!Array.isArray(dto.activities) || dto.activities.length !== execution.activities.length) {
        throw new BadRequestException('Debes enviar todas las actividades del cronograma');
      }
      const inputById = new Map(dto.activities.map((activity) => [String(activity.id), activity]));
      if (inputById.size !== execution.activities.length) throw new BadRequestException('Hay actividades duplicadas o desconocidas');
      const revisedActivities = execution.activities.map((activity: any) => {
        const input = inputById.get(activity.id);
        if (!input) throw new BadRequestException(`Falta la actividad ${activity.name}`);
        const estimatedMinutes = Math.round(Number(input.estimatedMinutes));
        if (!Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0) {
          throw new BadRequestException(`La duración de "${activity.name}" debe ser mayor que cero`);
        }
        if (!Array.isArray(input.dependsOnPositions)) throw new BadRequestException(`Dependencias inválidas en "${activity.name}"`);
        const dependsOnPositions = Array.from(new Set(input.dependsOnPositions.map(Number))).sort((a, b) => a - b);
        if (dependsOnPositions.some((position) => !Number.isInteger(position) || position < 1 || position >= activity.position)) {
          throw new BadRequestException(`"${activity.name}" solo puede depender de actividades anteriores`);
        }
        return { ...activity, estimatedMinutes, dependsOnPositions };
      });

      const currentCalendar = this.calendarFromExecution(execution);
      const currentStart = new Date(execution.scheduledStartAt || execution.workOrder.dueDate || execution.createdAt);
      const currentSchedule = this.buildSchedule(execution.activities, currentStart, currentCalendar);
      const revisedSchedule = this.buildSchedule(revisedActivities, scheduledStartAt, calendar);
      const plannedMinutes = this.criticalPathMinutes(revisedActivities);
      const plannedLaborMinutes = revisedActivities.reduce(
        (sum: number, activity: any) => sum + activity.estimatedMinutes * activity.plannedTechnicians,
        0,
      );
      const currentVersion = Math.max(1, Number(execution.scheduleVersion || 1));

      await tx.assemblyScheduleRevision.create({
        data: {
          tenantId,
          executionId: id,
          version: currentVersion,
          reason,
          createdByUserId: userId,
          createdByName: actor.name,
          baselineStartAt: currentSchedule.start,
          baselineEndAt: currentSchedule.end,
          snapshot: this.scheduleSnapshot(execution, currentSchedule),
        },
      });
      for (const activity of revisedActivities) {
        await tx.assemblyActivity.update({
          where: { id: activity.id },
          data: { estimatedMinutes: activity.estimatedMinutes, dependsOnPositions: activity.dependsOnPositions },
        });
      }
      await tx.assemblyExecution.update({
        where: { id },
        data: {
          scheduleVersion: currentVersion + 1,
          scheduledStartAt,
          scheduleTimezone: calendar.timezone,
          workdayStartMinute: calendar.startMinute,
          workdayEndMinute: calendar.endMinute,
          workingDays: calendar.workingDays,
          excludedDates: calendar.excludedDates,
          plannedMinutes,
          plannedLaborMinutes,
        },
      });
      await tx.workOrder.update({
        where: { id: execution.workOrderId },
        data: { dueDate: revisedSchedule.end, durationMin: plannedMinutes },
      });
    });
    return this.get(id);
  }

  async updateSignatures(id: string, dto: UpdateAssemblySignaturesDto) {
    const { tenantId, userId } = this.context();
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const execution = await tx.assemblyExecution.findFirst({
        where: { id, tenantId },
        include: {
          activities: { select: { status: true } },
          workOrder: { include: { assignments: { where: { state: 'ACTIVE' }, select: { userId: true } } } },
        },
      });
      if (!execution) throw new NotFoundException('Montaje no encontrado');
      const assigned = execution.workOrder.assignments.some((item: any) => item.userId === userId);
      if (actor.role !== 'ADMIN' && (actor.role !== 'TECH' || !assigned)) {
        throw new ForbiddenException('No estás asignado a este montaje');
      }
      if (dto.receiverSignature !== undefined && dto.receiverSignature) {
        const allDone = execution.activities.every((item: any) => FINAL_ACTIVITY_STATUSES.has(item.status));
        if (!allDone) throw new ConflictException('La firma de recibido se habilita al completar todas las actividades');
      }
      const data: any = {};
      if (dto.technicianSignature !== undefined) data.technicianSignature = dto.technicianSignature || null;
      if (dto.receiverSignature !== undefined) data.receiverSignature = dto.receiverSignature || null;
      if (Object.keys(data).length) await tx.workOrder.update({ where: { id: execution.workOrderId }, data });
    });
    return this.get(id);
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
    const requestedStart = new Date(execution.scheduledStartAt || execution.workOrder?.dueDate || execution.createdAt || now);
    const calendar = this.calendarFromExecution(execution);
    const schedule = this.buildSchedule(execution.activities, requestedStart, calendar);
    const activities = execution.activities.map((activity: any) => {
      const planned = schedule.byPosition.get(activity.position) || { start: schedule.start, end: schedule.start };
      const plannedStartAt = planned.start;
      const plannedEndAt = planned.end;
      const actualMinutes = this.activityActualMinutes(activity, now);
      actualLaborMinutes += actualMinutes;
      const progress = FINAL_ACTIVITY_STATUSES.has(activity.status) ? 100 : Math.max(0, Math.min(100, activity.progressPercent || 0));
      earnedMinutes += activity.estimatedMinutes * activity.plannedTechnicians * (progress / 100);
      const final = FINAL_ACTIVITY_STATUSES.has(activity.status);
      const overdue = !final && now.getTime() > plannedEndAt.getTime();
      const remainingMs = plannedEndAt.getTime() - now.getTime();
      const dueSoon = !final && !overdue && remainingMs >= 0 && remainingMs <= 24 * 60 * 60_000;
      const laborBudget = activity.estimatedMinutes * activity.plannedTechnicians;
      const laborOverrun = !final && actualMinutes > laborBudget;
      const alerts: Array<{ code: string; severity: 'CRITICAL' | 'WARNING'; message: string }> = [];
      if (activity.status === 'BLOCKED') alerts.push({ code: 'BLOCKED', severity: 'CRITICAL', message: activity.blockedReason || 'Actividad bloqueada' });
      if (overdue) alerts.push({ code: 'OVERDUE', severity: 'CRITICAL', message: `Vencida hace ${Math.max(1, Math.round(-remainingMs / 60_000))} min` });
      if (dueSoon) alerts.push({ code: 'DUE_SOON', severity: 'WARNING', message: `Vence en ${Math.max(1, Math.round(remainingMs / 60_000))} min` });
      if (laborOverrun) alerts.push({ code: 'LABOR_OVERRUN', severity: 'WARNING', message: `Supera el presupuesto en ${actualMinutes - laborBudget} min HH` });
      const riskLevel = final
        ? 'DONE'
        : alerts.some((alert) => alert.severity === 'CRITICAL')
          ? 'CRITICAL'
          : alerts.length
            ? 'WARNING'
            : 'ON_TRACK';
      return {
        ...activity,
        plannedStartAt: plannedStartAt.toISOString(),
        plannedEndAt: plannedEndAt.toISOString(),
        actualElapsedMinutes: activity.startedAt
          ? Math.max(0, Math.round(((activity.completedAt ? new Date(activity.completedAt) : now).getTime() - new Date(activity.startedAt).getTime()) / 60_000))
          : 0,
        scheduleVarianceMinutes: activity.startedAt
          ? Math.round(((activity.completedAt ? new Date(activity.completedAt) : now).getTime() - plannedEndAt.getTime()) / 60_000)
          : 0,
        actualMinutes,
        varianceMinutes: actualMinutes - activity.estimatedMinutes * activity.plannedTechnicians,
        riskLevel,
        alerts,
      };
    });
    const plannedLaborMinutes = Math.max(0, execution.plannedLaborMinutes || 0);
    const progressPercent = plannedLaborMinutes > 0 ? Math.round((earnedMinutes / plannedLaborMinutes) * 100) : 0;
    const budgetConsumedPercent = plannedLaborMinutes > 0 ? Math.round((actualLaborMinutes / plannedLaborMinutes) * 100) : 0;
    const forecastLaborMinutes = progressPercent > 0
      ? Math.round(actualLaborMinutes / (progressPercent / 100))
      : plannedLaborMinutes;
    const blockedActivities = activities.filter((activity: any) => activity.alerts.some((alert: any) => alert.code === 'BLOCKED')).length;
    const overdueActivities = activities.filter((activity: any) => activity.alerts.some((alert: any) => alert.code === 'OVERDUE')).length;
    const dueSoonActivities = activities.filter((activity: any) => activity.alerts.some((alert: any) => alert.code === 'DUE_SOON')).length;
    const laborRisk = progressPercent > 0 && budgetConsumedPercent > progressPercent + 15;
    const pendingSignature = execution.status === 'COMPLETED' && !execution.workOrder?.receiverSignature;
    const operationalAlerts: Array<{ code: string; severity: 'CRITICAL' | 'WARNING'; message: string; count?: number }> = [];
    if (blockedActivities) operationalAlerts.push({ code: 'BLOCKED', severity: 'CRITICAL', message: `${blockedActivities} actividad${blockedActivities === 1 ? '' : 'es'} bloqueada${blockedActivities === 1 ? '' : 's'}`, count: blockedActivities });
    if (overdueActivities) operationalAlerts.push({ code: 'OVERDUE', severity: 'CRITICAL', message: `${overdueActivities} actividad${overdueActivities === 1 ? '' : 'es'} vencida${overdueActivities === 1 ? '' : 's'}`, count: overdueActivities });
    if (dueSoonActivities) operationalAlerts.push({ code: 'DUE_SOON', severity: 'WARNING', message: `${dueSoonActivities} actividad${dueSoonActivities === 1 ? '' : 'es'} vence${dueSoonActivities === 1 ? '' : 'n'} en menos de 24 horas`, count: dueSoonActivities });
    if (laborRisk) operationalAlerts.push({ code: 'LABOR_RISK', severity: 'WARNING', message: 'El consumo de horas supera el avance físico' });
    if (pendingSignature) operationalAlerts.push({ code: 'PENDING_SIGNATURE', severity: 'WARNING', message: 'Pendiente firma de recibido del cliente' });
    const riskLevel = execution.status === 'COMPLETED' && !pendingSignature
      ? 'DONE'
      : operationalAlerts.some((alert) => alert.severity === 'CRITICAL')
        ? 'CRITICAL'
        : operationalAlerts.length
          ? 'WARNING'
          : 'ON_TRACK';
    const pendingActivities = activities.filter((activity: any) => !FINAL_ACTIVITY_STATUSES.has(activity.status));
    const nextActivityDueAt = pendingActivities.length
      ? pendingActivities.reduce((earliest: any, activity: any) => new Date(activity.plannedEndAt).getTime() < new Date(earliest.plannedEndAt).getTime() ? activity : earliest).plannedEndAt
      : null;
    return {
      ...execution,
      asset,
      activities,
      operationalAlerts,
      metrics: {
        progressPercent,
        actualLaborMinutes,
        budgetConsumedPercent,
        forecastLaborMinutes,
        baselineStartAt: schedule.start.toISOString(),
        baselineEndAt: schedule.end.toISOString(),
        riskLevel,
        blockedActivities,
        overdueActivities,
        dueSoonActivities,
        laborRisk,
        pendingSignature,
        nextActivityDueAt,
        riskUpdatedAt: now.toISOString(),
      },
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
      const dependencyPositions = Array.isArray(ctx.activity.dependsOnPositions)
        ? ctx.activity.dependsOnPositions.map(Number)
        : [];
      const pendingDependency = ctx.execution.activities.find(
        (item: any) => dependencyPositions.includes(item.position) && !FINAL_ACTIVITY_STATUSES.has(item.status),
      );
      if (pendingDependency) throw new ConflictException(`Primero debes completar: ${pendingDependency.name}`);
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
      await tx.manufacturingSiteDeployment.updateMany({
        where: { tenantId: ctx.tenantId, assemblyExecutionId: id },
        data: { status: 'INSTALLING', lockVersion: { increment: 1 } },
      });
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
      if (ctx.activity.evidenceRequired) {
        const evidenceCount = await tx.attachment.count({
          where: { tenantId: ctx.tenantId, assemblyActivityId: activityId },
        });
        if (evidenceCount === 0) {
          throw new BadRequestException('Debes adjuntar al menos una evidencia antes de completar esta actividad');
        }
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
    await tx.manufacturingSiteDeployment.updateMany({
      where: { tenantId: execution.tenantId, assemblyExecutionId: execution.id },
      data: {
        status: allDone ? 'READY_FOR_SAT' : hasStarted ? 'INSTALLING' : 'INSTALLATION_PLANNED',
        lockVersion: { increment: 1 },
      },
    });
    await tx.workOrder.update({
      where: { id: execution.workOrderId },
      data: allDone
        ? { status: 'COMPLETED', completedAt: now, activityFinishedAt: now, commercialStatus: 'COMPLETED' }
        : { status: status === 'IN_PROGRESS' ? 'IN_PROGRESS' : hasStarted ? 'ON_HOLD' : execution.workOrder.status },
    });
  }
}
