import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { CreateToolDto, EditToolDto, LendToolDto, ReceiveToolsDto, ReturnToolDto, ToolConditionDto, ToolListDto } from './tools.dto';
import { dateOnly, loanedQty, parseToolCsv, stockChange, stockField, validateTool } from './tools.domain';

type Actor = { id: string; name: string; role: string; tenantId: string };
type Tx = Prisma.TransactionClient;
const include = { photo: { select: { updatedAt: true } } } as const;
const validation = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

@Injectable()
export class ToolsService {
  constructor(private readonly prisma: PrismaService) {}

  private async actor(access: 'read' | 'operate' | 'manage' = 'read'): Promise<Actor> {
    const { tenantId, userId } = tenantStorage.getStore() || {};
    if (!tenantId || !userId) throw new ForbiddenException('Inicia sesión');
    const user = await this.prisma.user.findFirst({ where: { tenantId, id: userId }, select: { id: true, name: true, role: true, tenantId: true } });
    if (!user || (access === 'manage' && user.role !== 'ADMIN') || (access === 'operate' && !['ADMIN', 'TECH'].includes(user.role))) throw new ForbiddenException('No tienes permiso para esta operación');
    return user;
  }
  private async locked<T>(actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tools:${actor.tenantId}`}, 0))::text`;
      return fn(tx);
    }, { maxWait: 10000, timeout: 20000 });
  }
  private async find(db: Tx, actor: Actor, id: string) {
    const row = await db.tool.findFirst({ where: { id, tenantId: actor.tenantId }, include });
    if (!row) throw new NotFoundException('Herramienta no encontrada');
    return row;
  }
  private async user(db: Tx, actor: Actor, id?: string | null) {
    if (!id) return null;
    const user = await db.user.findFirst({ where: { tenantId: actor.tenantId, id }, select: { id: true, name: true } });
    if (!user) throw new BadRequestException('El responsable debe pertenecer a tu compañía');
    return user;
  }
  private fields(dto: EditToolDto | CreateToolDto) {
    return { code: dto.code.trim().toUpperCase(), name: dto.name, category: dto.category || null, brand: dto.brand || null,
      model: dto.model || null, serialNumber: dto.serialNumber || null, location: dto.location,
      responsibleUserId: dto.responsibleUserId || null, acquiredOn: dateOnly(dto.acquiredOn), notes: dto.notes || null };
  }
  private event(tx: Tx, actor: Actor, toolId: string, action: string, details: unknown, note?: string) {
    return tx.toolEvent.create({ data: { tenantId: actor.tenantId, toolId, action, actorId: actor.id, actorName: actor.name,
      details: JSON.parse(JSON.stringify(details)), note: note || null } });
  }
  private async uniqueCode(tx: Tx, actor: Actor, code: string, except?: string) {
    if (await tx.tool.findFirst({ where: { tenantId: actor.tenantId, code, ...(except ? { id: { not: except } } : {}) }, select: { id: true } })) throw new ConflictException(`Ya existe una herramienta con código ${code}`);
  }
  async list(query: ToolListDto) {
    const actor = await this.actor();
    const where: Prisma.ToolWhereInput = { tenantId: actor.tenantId };
    if (query.q?.trim()) where.OR = ['code', 'name', 'brand', 'model', 'serialNumber'].map(key => ({ [key]: { contains: query.q!.trim(), mode: 'insensitive' } }));
    for (const key of ['location', 'category'] as const) if (query[key]) where[key] = { contains: query[key], mode: 'insensitive' };
    if (query.tracking) where.tracking = query.tracking;
    if (query.responsibleUserId) where.AND = [{ OR: [{ responsibleUserId: query.responsibleUserId }, { loans: { some: { recipientUserId: query.responsibleUserId, returnedAt: null } } }] }];
    const states = { AVAILABLE: 'availableQty', MAINTENANCE: 'maintenanceQty', DAMAGED: 'damagedQty', RETIRED: 'retiredQty' } as const;
    if (query.status === 'LOANED') where.loans = { some: { returnedAt: null } };
    else if (query.status) where[states[query.status]] = { gt: 0 };
    const page = query.page || 1;
    const [items, total, sums] = await Promise.all([
      this.prisma.tool.findMany({ where, include, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * 30, take: 30 }),
      this.prisma.tool.count({ where }),
      this.prisma.tool.aggregate({ where, _sum: { quantity: true, availableQty: true, maintenanceQty: true, damagedQty: true, retiredQty: true } }),
    ]);
    const stock = { quantity: sums._sum.quantity || 0, availableQty: sums._sum.availableQty || 0, maintenanceQty: sums._sum.maintenanceQty || 0, damagedQty: sums._sum.damagedQty || 0, retiredQty: sums._sum.retiredQty || 0, tracking: 'QUANTITY' };
    return { items: items.map(row => ({ ...row, loanedQty: loanedQty(row) })), total, page, pages: Math.ceil(total / 30), stats: { ...stock, loanedQty: loanedQty(stock) }, permissions: { manage: actor.role === 'ADMIN', operate: ['ADMIN', 'TECH'].includes(actor.role) } };
  }
  async detail(id: string) {
    const actor = await this.actor();
    const row = await this.find(this.prisma, actor, id);
    const [loans, closedLoans, responsible] = await Promise.all([
      this.prisma.toolLoan.findMany({ where: { tenantId: actor.tenantId, toolId: id, returnedAt: null }, orderBy: { createdAt: 'desc' } }),
      this.prisma.toolLoan.findMany({ where: { tenantId: actor.tenantId, toolId: id, returnedAt: { not: null } }, orderBy: { returnedAt: 'desc' }, take: 20 }),
      row.responsibleUserId ? this.prisma.user.findFirst({ where: { id: row.responsibleUserId, tenantId: actor.tenantId }, select: { id: true, name: true } }) : null,
    ]);
    return { ...row, loans, closedLoans, responsible, loanedQty: loanedQty(row), permissions: { manage: actor.role === 'ADMIN', operate: ['ADMIN', 'TECH'].includes(actor.role) } };
  }
  async events(id: string, page = 1) {
    const actor = await this.actor();
    await this.find(this.prisma, actor, id);
    const where = { tenantId: actor.tenantId, toolId: id };
    const [items, total] = await Promise.all([
      this.prisma.toolEvent.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 30, take: 30 }),
      this.prisma.toolEvent.count({ where }),
    ]);
    return { items, total, page, pages: Math.ceil(total / 30) };
  }
  private async createRow(tx: Tx, actor: Actor, dto: CreateToolDto, action = 'created') {
    validateTool(dto.tracking, dto.quantity, dto.serialNumber);
    await this.user(tx, actor, dto.responsibleUserId);
    const fields = this.fields(dto);
    await this.uniqueCode(tx, actor, fields.code);
    const balances = { availableQty: 0, maintenanceQty: 0, damagedQty: 0, retiredQty: 0 };
    balances[stockField[(dto.initialCondition || 'GOOD') as keyof typeof stockField]] = dto.quantity;
    const row = await tx.tool.create({ data: { ...fields, ...balances, tenantId: actor.tenantId, tracking: dto.tracking, quantity: dto.quantity } });
    await this.event(tx, actor, row.id, action, { ...fields, tracking: dto.tracking, quantity: dto.quantity, condition: dto.initialCondition || 'GOOD' });
    return row;
  }
  async create(dto: CreateToolDto) {
    const actor = await this.actor('manage');
    const row = await this.locked(actor, tx => this.createRow(tx, actor, dto));
    return this.detail(row.id);
  }
  private async mutate(id: string, version: number, access: 'operate' | 'manage', fn: (tx: Tx, row: Awaited<ReturnType<ToolsService['find']>>, actor: Actor) => Promise<unknown>) {
    const actor = await this.actor(access);
    await this.locked(actor, async tx => {
      const row = await this.find(tx, actor, id);
      if (!Number.isInteger(version) || row.version !== version) throw new ConflictException('La herramienta cambió. Actualiza antes de continuar.');
      await fn(tx, row, actor);
      await tx.tool.update({ where: { tenantId_id: { tenantId: actor.tenantId, id } }, data: { version: { increment: 1 } } });
    });
    return this.detail(id);
  }
  async edit(id: string, dto: EditToolDto) {
    return this.mutate(id, dto.version, 'manage', async (tx, row, actor) => {
      validateTool(row.tracking, row.quantity, dto.serialNumber);
      await this.user(tx, actor, dto.responsibleUserId);
      const fields = this.fields(dto);
      await this.uniqueCode(tx, actor, fields.code, id);
      const before = Object.fromEntries(Object.keys(fields).map(key => [key, row[key as keyof typeof row]]));
      await tx.tool.update({ where: { tenantId_id: { tenantId: actor.tenantId, id } }, data: fields });
      await this.event(tx, actor, id, 'edited', { before, after: fields });
    });
  }
  async lend(id: string, dto: LendToolDto) {
    return this.mutate(id, dto.version, 'operate', async (tx, row, actor) => {
      if (dto.quantity > row.availableQty) throw new ConflictException('No hay suficientes unidades disponibles');
      const user = await this.user(tx, actor, dto.recipientUserId);
      const due = dateOnly(dto.expectedReturnOn);
      if (due && due.toISOString().slice(0, 10) < new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(new Date())) throw new BadRequestException('La devolución prevista no puede ser anterior a hoy');
      const loan = await tx.toolLoan.create({ data: { tenantId: actor.tenantId, toolId: id, quantity: dto.quantity,
        recipientUserId: user!.id, recipientName: user!.name, destination: dto.destination, expectedReturnOn: due,
        deliveredById: actor.id, deliveredByName: actor.name, note: dto.note || null } });
      await tx.tool.update({ where: { tenantId_id: { tenantId: actor.tenantId, id } }, data: { availableQty: { decrement: dto.quantity } } });
      await this.event(tx, actor, id, 'lent', { loanId: loan.id, quantity: dto.quantity, recipientName: user!.name, recipientUserId: user!.id, destination: dto.destination, expectedReturnOn: due, condition: 'GOOD' }, dto.note);
    });
  }
  async returnLoan(id: string, loanId: string, dto: ReturnToolDto) {
    return this.mutate(id, dto.version, 'operate', async (tx, _row, actor) => {
      const loan = await tx.toolLoan.findFirst({ where: { id: loanId, tenantId: actor.tenantId, toolId: id } });
      if (!loan) throw new NotFoundException('Entrega no encontrada');
      if (dto.quantity > loan.quantity - loan.returnedQty) throw new ConflictException('La devolución supera la cantidad pendiente');
      if (dto.condition !== 'GOOD' && !dto.note?.trim()) throw new BadRequestException('Describe la condición de la herramienta devuelta');
      const returnedQty = loan.returnedQty + dto.quantity;
      await tx.toolLoan.update({ where: { id: loanId }, data: { returnedQty, returnedAt: returnedQty === loan.quantity ? new Date() : null } });
      const field = stockField[dto.condition as 'GOOD' | 'MAINTENANCE' | 'DAMAGED'];
      await tx.tool.update({ where: { tenantId_id: { tenantId: actor.tenantId, id } }, data: { [field]: { increment: dto.quantity } } });
      await this.event(tx, actor, id, 'returned', { loanId, quantity: dto.quantity, condition: dto.condition, recipientName: loan.recipientName, location: _row.location, remainingQty: loan.quantity - returnedQty }, dto.note);
    });
  }
  async condition(id: string, dto: ToolConditionDto) {
    return this.mutate(id, dto.version, 'manage', async (tx, row, actor) => {
      const data = stockChange(row, dto.from, dto.to, dto.quantity);
      await tx.tool.update({ where: { tenantId_id: { tenantId: actor.tenantId, id } }, data });
      await this.event(tx, actor, id, 'condition_changed', { from: dto.from, to: dto.to, quantity: dto.quantity }, dto.note);
    });
  }
  async receive(id: string, dto: ReceiveToolsDto) {
    return this.mutate(id, dto.version, 'manage', async (tx, row, actor) => {
      if (row.tracking !== 'QUANTITY') throw new BadRequestException('Registra cada herramienta individual con su propio código');
      if (row.quantity + dto.quantity > 1000000) throw new BadRequestException('La cantidad total supera el máximo permitido');
      await tx.tool.update({ where: { tenantId_id: { tenantId: actor.tenantId, id } }, data: { quantity: { increment: dto.quantity }, availableQty: { increment: dto.quantity } } });
      await this.event(tx, actor, id, 'received', { quantity: dto.quantity }, dto.note);
    });
  }
  async setPhoto(id: string, version: number, file?: { buffer: Buffer }) {
    if (!file?.buffer?.length || file.buffer.length > 5 * 1024 * 1024) throw new BadRequestException('Selecciona una imagen de máximo 5 MB');
    const data = file.buffer;
    const mimeType = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : data[0] === 255 && data[1] === 216 && data[2] === 255 ? 'image/jpeg'
      : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
    if (!mimeType) throw new BadRequestException('Usa imágenes PNG, JPEG o WebP');
    return this.mutate(id, version, 'manage', async (tx, _row, actor) => {
      await tx.toolPhoto.upsert({ where: { tenantId_toolId: { tenantId: actor.tenantId, toolId: id } },
        create: { tenantId: actor.tenantId, toolId: id, mimeType, data }, update: { mimeType, data } });
      await this.event(tx, actor, id, 'photo_updated', { mimeType });
    });
  }
  async photo(id: string) {
    const actor = await this.actor();
    const photo = await this.prisma.toolPhoto.findUnique({ where: { tenantId_toolId: { tenantId: actor.tenantId, toolId: id } } });
    if (!photo) throw new NotFoundException('Fotografía no encontrada');
    return photo;
  }
  private async importRows(tx: Tx, actor: Actor, csv: string) {
    const raw = parseToolCsv(csv);
    const users = await tx.user.findMany({ where: { tenantId: actor.tenantId }, select: { id: true, email: true } });
    const seen = new Set<string>();
    const rows: CreateToolDto[] = [];
    for (const [index, r] of raw.entries()) {
      try {
        const control = ({ INDIVIDUAL: 'UNIT', CANTIDAD: 'QUANTITY' } as Record<string, string>)[r.control.toUpperCase()];
        const user = r.responsable_email ? users.find(u => u.email.toLowerCase() === r.responsable_email.toLowerCase()) : null;
        if (r.responsable_email && !user) throw new BadRequestException('Responsable no encontrado en tu compañía');
        const dto = await validation.transform({ code: r.codigo, name: r.nombre, tracking: control || r.control, quantity: /^\d+$/.test(r.cantidad) ? Number(r.cantidad) : NaN,
          location: r.ubicacion, category: r.categoria, brand: r.marca, model: r.modelo, serialNumber: r.serial,
          responsibleUserId: user?.id, acquiredOn: r.fecha_compra || undefined, notes: r.observaciones }, { type: 'body', metatype: CreateToolDto }) as CreateToolDto;
        validateTool(dto.tracking, dto.quantity, dto.serialNumber); dateOnly(dto.acquiredOn);
        dto.code = dto.code.toUpperCase();
        if (seen.has(dto.code)) throw new BadRequestException(`Código repetido: ${dto.code}`);
        seen.add(dto.code); rows.push(dto);
      } catch (error) {
        const response = (error as BadRequestException).getResponse?.();
        const message = typeof response === 'object' && response && 'message' in response ? (response as { message: string | string[] }).message : (error as Error).message;
        throw new BadRequestException(`Fila ${index + 2}: ${Array.isArray(message) ? message.join(', ') : message}`);
      }
    }
    const duplicates = await tx.tool.findMany({ where: { tenantId: actor.tenantId, code: { in: rows.map(r => r.code) } }, select: { code: true } });
    if (duplicates.length) throw new ConflictException('Los códigos ya existen: ' + duplicates.map(r => r.code).join(', '));
    return rows;
  }
  async previewImport(csv: string) {
    const actor = await this.actor('manage');
    const rows = await this.importRows(this.prisma, actor, csv);
    return { rows, count: rows.length };
  }
  async commitImport(csv: string) {
    const actor = await this.actor('manage');
    return this.locked(actor, async tx => {
      const rows = await this.importRows(tx, actor, csv);
      for (const row of rows) await this.createRow(tx, actor, row, 'imported');
      return { count: rows.length };
    });
  }
}
