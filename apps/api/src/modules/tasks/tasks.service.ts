import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { Actor, assertNoCycle, assertPermission, canView, permissions, transition, validateConfiguration } from './tasks.domain';
import { DependencyDto, EditTaskDto, TaskActionDto, TaskInputDto, TaskListDto, TaskUpdateDto } from './tasks.dto';

const baseInclude = { participants: true, dependencies: { include: { predecessor: { include: { participants: true } } } } };
const fileSelect = { id: true, filename: true, size: true, updateId: true, createdAt: true, createdByUserId: true };
const active = ['PENDING', 'IN_PROGRESS', 'PAUSED'];
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}
  private db(): any { return this.prisma; }
  private async actor(): Promise<Actor> {
    const { tenantId, userId } = tenantStorage.getStore() || {};
    if (!tenantId || !userId) throw new ForbiddenException('Inicia sesión');
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, name: true, role: true, tenantId: true } });
    if (!user) throw new ForbiddenException('Usuario no encontrado');
    return user;
  }
  private visible(actor: Actor) {
    return { tenantId: actor.tenantId, OR: [ { createdByUserId: actor.id }, { visibility: 'PUBLIC' },
      { visibility: 'SELECTIVE', OR: [{ responsibleUserId: actor.id }, { participants: { some: { userId: actor.id } } }] } ] };
  }
  private async find(db: any, id: string, actor: Actor, detail = false) {
    const row = await db.task.findFirst({ where: { id, ...this.visible(actor) }, include: { ...baseInclude, ...(detail ? {
      updates: { orderBy: { createdAt: 'desc' } }, events: { orderBy: { createdAt: 'desc' } }, attachments: { select: fileSelect, orderBy: { createdAt: 'desc' } },
    } : {}) } });
    if (!row) throw new NotFoundException('Tarea no encontrada');
    return row;
  }
  private present(row: any, actor: Actor) {
    const dependencies = row.dependencies.map((d: any) => canView(d.predecessor, actor)
      ? { id: d.id, predecessorId: d.predecessor.id, title: d.predecessor.title, status: d.predecessor.status, completed: d.predecessor.status === 'COMPLETED', restricted: false }
      : { id: d.id, restricted: true, completed: d.predecessor.status === 'COMPLETED' });
    return { ...row, dependencies, blocked: dependencies.some((d: any) => !d.completed),
      overdue: active.includes(row.status) && row.dueAt && new Date(row.dueAt) < new Date(), permissions: permissions(row, actor) };
  }
  async list(query: TaskListDto) {
    const actor = await this.actor();
    const where: any = { AND: [this.visible(actor)], archivedAt: query.archived === 'true' ? { not: null } : null };
    if (query.scope === 'assigned') where.responsibleUserId = actor.id;
    if (query.scope === 'created') where.createdByUserId = actor.id;
    if (query.scope === 'shared') { where.createdByUserId = { not: actor.id }; where.AND.push({ OR: [{ responsibleUserId: actor.id }, { participants: { some: { userId: actor.id } } }] }); }
    for (const key of ['status', 'priority', 'visibility', 'responsibleUserId'] as const) if (query[key]) where.AND.push({ [key]: query[key] });
    if (query.q) where.AND.push({ OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }, { tags: { has: query.q } }] });
    const overdue = { status: { in: active }, dueAt: { lt: new Date() } };
    const blocked = { status: { in: active }, dependencies: { some: { predecessor: { status: { not: 'COMPLETED' } } } } };
    const cutoff = new Date(Date.now() - 7 * 86400000);
    const stale = { status: { in: active }, OR: [{ lastProgressAt: { lt: cutoff } }, { lastProgressAt: null, createdAt: { lt: cutoff } }] };
    if (query.condition) where.AND.push({ overdue, blocked, stale }[query.condition]);
    const page = query.page || 1;
    const [items, total, pending, late, waiting, quiet] = await Promise.all([
      this.db().task.findMany({ where, include: baseInclude, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 30, take: 30 }),
      this.db().task.count({ where }),
      this.db().task.count({ where: { AND: [where, { status: { in: active } }] } }),
      this.db().task.count({ where: { AND: [where, overdue] } }),
      this.db().task.count({ where: { AND: [where, blocked] } }),
      this.db().task.count({ where: { AND: [where, stale] } }),
    ]);
    return { items: items.map((r: any) => this.present(r, actor)), total, page, pages: Math.ceil(total / 30), stats: { pending, overdue: late, blocked: waiting, stale: quiet } };
  }
  async references(type: string, q = '') {
    const actor = await this.actor();
    const definitions: Record<string, { search: string[]; select: any }> = {
      asset: { search: ['code', 'name'], select: { id: true, code: true, name: true } },
      workOrder: { search: ['title', 'assetCode'], select: { id: true, title: true, kind: true } },
      manufacturingOrder: { search: ['number', 'projectName', 'productName'], select: { id: true, number: true, projectName: true } },
    };
    const config = definitions[type];
    if (!config) throw new BadRequestException('Tipo de referencia inválido');
    const rows = await this.db()[type].findMany({ where: { tenantId: actor.tenantId, ...(q ? { OR: config.search.map(key => ({ [key]: { contains: q, mode: 'insensitive' } })) } : {}) }, select: config.select, take: 30, orderBy: { id: 'asc' } });
    return rows.map((row: any) => ({ id: row.id, label: type === 'asset' ? `${row.code} — ${row.name}` : type === 'workOrder' ? row.title : `${row.number} — ${row.projectName}` }));
  }
  async detail(id: string) {
    const actor = await this.actor();
    const row = await this.find(this.db(), id, actor, true);
    const related = [];
    for (const [type, referenceId] of [['asset', row.assetId], ['workOrder', row.workOrderId], ['manufacturingOrder', row.manufacturingOrderId]]) {
      if (!referenceId) continue;
      const reference = await this.db()[type].findFirst({ where: { id: referenceId, tenantId: actor.tenantId } });
      if (reference) related.push({ id: referenceId, type, label: type === 'asset' ? `${reference.code} — ${reference.name}` : type === 'workOrder' ? reference.title : `${reference.number} — ${reference.projectName}`, href: type === 'asset' ? `/assets/${referenceId}` : type === 'manufacturingOrder' ? `/manufacturing/${referenceId}` : `${reference.kind === 'SERVICE_ORDER' ? '/service-orders' : '/work-orders'}/${referenceId}` });
    }
    return { ...this.present(row, actor), related };
  }
  // Every task mutation takes the same per-tenant transaction lock BEFORE reading.
  // This serializes graph edits and execution/reopening checks, including different task IDs.
  private async locked<T>(actor: Actor, fn: (tx: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tasks:${actor.tenantId}`}, 0))::text`;
      return fn(tx);
    }, { maxWait: 10000, timeout: 15000, isolationLevel: 'ReadCommitted' });
  }
  private async mutate(id: string, version: number, kind: 'manage' | 'execute' | 'contribute', fn: (tx: any, row: any, actor: Actor) => Promise<void>, allowArchived = false) {
    const actor = await this.actor();
    if (!Number.isInteger(version) || version < 1) throw new BadRequestException('Versión inválida');
    await this.locked(actor, async tx => {
      const row = await this.find(tx, id, actor);
      assertPermission(row, actor, kind);
      if (row.archivedAt && !allowArchived) throw new ConflictException('Restaura la tarea antes de modificarla');
      if (row.version !== version) throw new ConflictException('La tarea cambió. Recarga antes de continuar.');
      await tx.task.update({ where: { id }, data: { version: { increment: 1 } } });
      await fn(tx, row, actor);
    });
    return this.detail(id);
  }
  private async event(tx: any, row: any, actor: Actor, action: string, note?: string, details?: any) {
    await tx.taskEvent.create({ data: { tenantId: actor.tenantId, taskId: row.id, actorId: actor.id, actorName: actor.name, action, note, ...(details ? { details: JSON.parse(JSON.stringify(details)) } : {}) } });
  }
  private async validateInput(tx: any, dto: TaskInputDto, actor: Actor, creatorId: string) {
    validateConfiguration(dto, creatorId);
    const ids = [...new Set([dto.responsibleUserId, ...dto.participants.map(p => p.userId)].filter(Boolean))] as string[];
    const users = await tx.user.findMany({ where: { tenantId: actor.tenantId, id: { in: ids } }, select: { id: true, role: true } });
    if (users.length !== ids.length) throw new BadRequestException('Los participantes deben pertenecer a tu empresa');
    if (users.some((u: any) => u.role === 'VIEWER' && (u.id === dto.responsibleUserId || dto.participants.some(p => p.userId === u.id && p.role === 'COLLABORATOR')))) throw new BadRequestException('Un usuario de solo lectura no puede ejecutar tareas');
    for (const [model, id] of [['asset', dto.assetId], ['workOrder', dto.workOrderId], ['manufacturingOrder', dto.manufacturingOrderId]]) {
      if (id && !await tx[model!].findFirst({ where: { id, tenantId: actor.tenantId }, select: { id: true } })) throw new BadRequestException('La referencia no pertenece a tu empresa');
    }
  }
  private fields(dto: TaskInputDto) {
    return { title: dto.title, description: dto.description, expectedResult: dto.expectedResult, visibility: dto.visibility, priority: dto.priority,
      responsibleUserId: dto.responsibleUserId || null, plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : null,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null, tags: dto.tags, assetId: dto.assetId || null, workOrderId: dto.workOrderId || null, manufacturingOrderId: dto.manufacturingOrderId || null };
  }
  async create(dto: TaskInputDto) {
    const actor = await this.actor();
    if (!['ADMIN', 'TECH'].includes(actor.role)) throw new ForbiddenException('Solo lectura');
    const id = await this.locked(actor, async tx => {
      await this.validateInput(tx, dto, actor, actor.id);
      const row = await tx.task.create({ data: { ...this.fields(dto), tenantId: actor.tenantId, createdByUserId: actor.id } });
      if (dto.participants.length) await tx.taskParticipant.createMany({ data: dto.participants.map(p => ({ ...p, tenantId: actor.tenantId, taskId: row.id })) });
      await this.event(tx, row, actor, 'created');
      return row.id;
    });
    return this.detail(id);
  }
  async edit(id: string, dto: EditTaskDto) {
    return this.mutate(id, dto.version, 'manage', async (tx, row, actor) => {
      if (['COMPLETED', 'CANCELED'].includes(row.status)) throw new ConflictException('Reabre la tarea antes de editarla');
      await this.validateInput(tx, dto, actor, row.createdByUserId);
      if (row.startedAt && !dto.responsibleUserId) throw new ConflictException('Una tarea iniciada debe conservar un responsable');
      const data = this.fields(dto);
      const before = Object.fromEntries(Object.keys(data).map(k => [k, row[k]]));
      await tx.task.update({ where: { id }, data });
      await tx.taskParticipant.deleteMany({ where: { tenantId: actor.tenantId, taskId: id } });
      if (dto.participants.length) await tx.taskParticipant.createMany({ data: dto.participants.map(p => ({ ...p, tenantId: actor.tenantId, taskId: id })) });
      await this.event(tx, row, actor, 'edited', undefined, { before: { ...before, participants: row.participants.map((p: any) => ({ userId: p.userId, role: p.role })) }, after: { ...data, participants: dto.participants } });
    });
  }
  async action(id: string, dto: TaskActionDto) {
    const manage = ['archive', 'restore', 'cancel', 'reopen'].includes(dto.action);
    return this.mutate(id, dto.version, manage ? 'manage' : 'execute', async (tx, row, actor) => {
      if (dto.action === 'archive' || dto.action === 'restore') {
        if (dto.action === 'archive' && !['COMPLETED', 'CANCELED'].includes(row.status)) throw new ConflictException('Completa o cancela la tarea antes de archivarla');
        if ((dto.action === 'restore') !== Boolean(row.archivedAt)) throw new ConflictException('La tarea ya tiene ese estado de archivo');
        await tx.task.update({ where: { id }, data: { archivedAt: dto.action === 'archive' ? new Date() : null } });
      } else {
        const blocked = row.dependencies.some((d: any) => d.predecessor.status !== 'COMPLETED');
        const status = transition(row, dto.action, dto.note, blocked);
        if (dto.action === 'reopen') {
          const runningSuccessor = await tx.taskDependency.findFirst({ where: { tenantId: actor.tenantId, predecessorId: id, task: { OR: [{ startedAt: { not: null } }, { status: 'COMPLETED' }] } } });
          if (runningSuccessor) throw new ConflictException('Una tarea sucesora ya fue iniciada. Resuelve primero esa dependencia.');
        }
        const data: any = { status };
        if (dto.action === 'start') data.startedAt = row.startedAt || new Date();
        if (dto.action === 'complete') { data.progressPercent = 100; data.completedAt = new Date(); data.lastProgressAt = new Date(); }
        if (dto.action === 'reopen') { data.progressPercent = 0; data.completedAt = null; data.startedAt = null; }
        await tx.task.update({ where: { id }, data });
      }
      await this.event(tx, row, actor, dto.action, dto.note);
    }, dto.action === 'restore');
  }
  async update(id: string, dto: TaskUpdateDto) {
    return this.mutate(id, dto.version, 'contribute', async (tx, row, actor) => {
      if (dto.kind === 'COMMENT' && (dto.progressPercent !== undefined || dto.minutesSpent !== undefined)) throw new BadRequestException('Un comentario no modifica el avance ni el tiempo');
      if (dto.kind === 'PROGRESS') {
        if (row.status !== 'IN_PROGRESS') throw new ConflictException('Inicia la tarea para registrar avances');
        if (row.dependencies.some((d: any) => d.predecessor.status !== 'COMPLETED')) throw new ConflictException('La tarea tiene dependencias pendientes');
        await tx.task.update({ where: { id }, data: { progressPercent: dto.progressPercent, lastProgressAt: new Date() } });
      }
      await tx.taskUpdate.create({ data: { tenantId: actor.tenantId, taskId: id, kind: dto.kind, note: dto.note,
        progressPercent: dto.kind === 'PROGRESS' ? dto.progressPercent : null, minutesSpent: dto.minutesSpent || 0, actorId: actor.id, actorName: actor.name } });
    });
  }
  async addDependency(id: string, dto: DependencyDto) {
    return this.mutate(id, dto.version, 'manage', async (tx, row, actor) => {
      const predecessor = await this.find(tx, dto.predecessorId, actor);
      if (row.status !== 'PENDING' || row.startedAt) throw new ConflictException('Solo puedes agregar dependencias antes de iniciar la tarea');
      if (predecessor.archivedAt || predecessor.status === 'CANCELED') throw new ConflictException('La predecesora está archivada o cancelada');
      if (row.dependencies.some((d: any) => d.predecessorId === dto.predecessorId)) throw new ConflictException('Esta dependencia ya existe');
      const edges = await tx.taskDependency.findMany({ where: { tenantId: actor.tenantId }, select: { taskId: true, predecessorId: true } });
      assertNoCycle(id, dto.predecessorId, edges);
      await tx.taskDependency.create({ data: { tenantId: actor.tenantId, taskId: id, predecessorId: dto.predecessorId } });
      await this.event(tx, row, actor, 'dependency-added');
    });
  }
  async removeDependency(id: string, dependencyId: string, version: number) {
    return this.mutate(id, version, 'manage', async (tx, row, actor) => {
      if (!row.dependencies.some((d: any) => d.id === dependencyId)) throw new NotFoundException('Dependencia no encontrada');
      await tx.taskDependency.deleteMany({ where: { id: dependencyId, tenantId: actor.tenantId, taskId: id } });
      await this.event(tx, row, actor, 'dependency-removed');
    });
  }
  async attach(id: string, version: number, updateId: string | undefined, file: { filename: string; originalname: string; mimetype: string; size: number }) {
    return this.mutate(id, version, 'contribute', async (tx, row, actor) => {
      if (updateId && !await tx.taskUpdate.findFirst({ where: { id: updateId, tenantId: actor.tenantId, taskId: id } })) throw new BadRequestException('Avance no encontrado');
      await tx.taskAttachment.create({ data: { tenantId: actor.tenantId, taskId: id, updateId: updateId || null, filename: file.originalname.slice(0, 255), storageKey: file.filename, mimeType: file.mimetype, size: file.size, createdByUserId: actor.id } });
      await this.event(tx, row, actor, 'file-added', file.originalname.slice(0, 255));
    });
  }
  async file(id: string, fileId: string) {
    const actor = await this.actor();
    await this.find(this.db(), id, actor);
    const file = await this.db().taskAttachment.findFirst({ where: { id: fileId, taskId: id, tenantId: actor.tenantId } });
    if (!file) throw new NotFoundException('Archivo no encontrado');
    return file;
  }
}
