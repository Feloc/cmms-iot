import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { AccessDto, ActionDto, CAPABILITIES, CreateQuotationDto, DocumentDto, EditLinesDto, LineDto, LinkDto, ListDto, OfferDto, UploadDto } from './quotations.dto';
import { amount, D, documentFile, progress, quantity, remaining, required, TERMINAL } from './quotations.domain';

type Tx = Prisma.TransactionClient;
type Actor = { id: string; name: string; role: string; tenantId: string; capabilities: string[] };
const full = { lines: { orderBy: { position: 'asc' as const } }, offers: { orderBy: { createdAt: 'desc' as const } }, revisions: { orderBy: { number: 'desc' as const } }, documents: { orderBy: { createdAt: 'desc' as const } }, attachments: { orderBy: { createdAt: 'desc' as const } } };
type Case = Prisma.QuotationGetPayload<{ include: typeof full }>;
const areaCapability: Record<string, string> = { TECHNICAL: 'QUOTE', PURCHASING: 'PURCHASE', MANUFACTURING: 'SOURCE', WAREHOUSE: 'RECEIVE', BILLING: 'INVOICE', LOGISTICS: 'DISPATCH' };
const storage = () => join(process.env.ATTACHMENTS_DIR || resolve('./storage/attachments'), 'quotations');
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

@Injectable()
export class QuotationsService {
  constructor(private readonly db: PrismaService, private readonly ledger: InventoryLedgerService) {}
  private async actor(): Promise<Actor> {
    const { tenantId, userId } = tenantStorage.getStore() || {};
    if (!tenantId || !userId) throw new ForbiddenException('Inicia sesión');
    const user = await this.db.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, name: true, role: true, tenantId: true } });
    if (!user) throw new ForbiddenException('Usuario no disponible');
    const access = await this.db.quotationAccess.findUnique({ where: { tenantId_userId: { tenantId, userId } } });
    return { ...user, capabilities: user.role === 'ADMIN' ? [...CAPABILITIES] : access?.capabilities || [] };
  }
  private visible(actor: Actor): Prisma.QuotationWhereInput {
    return actor.role === 'ADMIN' || actor.capabilities.includes('READ') ? {} : { OR: [{ coordinatorId: actor.id }, { responsibleId: actor.id }, { createdById: actor.id }] };
  }
  private permissions(actor: Actor, row?: { coordinatorId: string }) {
    const caps = new Set(actor.capabilities);
    if (row?.coordinatorId === actor.id && actor.role !== 'VIEWER') caps.add('QUOTE');
    return { read: true, manage: actor.role === 'ADMIN' || row?.coordinatorId === actor.id && actor.role !== 'VIEWER',
      costs: ['QUOTE', 'SOURCE', 'PURCHASE'].some(c => caps.has(c)),
      capabilities: actor.role === 'VIEWER' ? [] : [...caps], admin: actor.role === 'ADMIN', create: actor.role !== 'VIEWER' };
  }
  private can(actor: Actor, row: Case, capability: string) {
    if (!this.permissions(actor, row).capabilities.includes(capability)) throw new ForbiddenException('No tienes permiso para esta etapa');
  }
  private manage(actor: Actor, row: Case) { if (!this.permissions(actor, row).manage) throw new ForbiddenException('Solo el coordinador o administración puede gestionar el expediente'); }
  private async find(tx: Tx, actor: Actor, id: string) {
    const row = await tx.quotation.findFirst({ where: { id, tenantId: actor.tenantId, ...this.visible(actor) }, include: full });
    if (!row) throw new NotFoundException('Cotización no encontrada');
    return row;
  }
  private async locked<T>(actor: Actor, id: string, version: number, fn: (tx: Tx, row: Case) => Promise<T>) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`quotations:${actor.tenantId}`}, 0))::text`;
      const row = await this.find(tx, actor, id);
      if (row.version !== version) throw new ConflictException('El expediente cambió. Actualiza antes de continuar');
      return fn(tx, row);
    }, { isolationLevel: 'Serializable', timeout: 20000 }).catch(error => {
      if (['P2034', 'P2002'].includes(error?.code)) throw new ConflictException('Otro usuario registró un cambio simultáneo. Actualiza el expediente');
      throw error;
    });
  }
  private active(row: Case) { if (TERMINAL.includes(row.status) || row.status === 'ON_HOLD') throw new ConflictException('El expediente está cerrado o en pausa'); }
  private draft(row: Case) { this.active(row); if (!['REQUESTED', 'SOURCING', 'QUOTING'].includes(row.status) || row.approvedRevision) throw new ConflictException('Solo se modifica la propuesta antes de enviarla'); }
  private async person(tx: Tx, actor: Actor, id: string, capability?: string) {
    const user = await tx.user.findFirst({ where: { id, tenantId: actor.tenantId }, select: { id: true, name: true, role: true } });
    if (!user || user.role === 'VIEWER') throw new BadRequestException('Selecciona un responsable operativo de tu compañía');
    if (capability && user.role !== 'ADMIN') {
      const access = await tx.quotationAccess.findUnique({ where: { tenantId_userId: { tenantId: actor.tenantId, userId: id } } });
      if (!access?.capabilities.includes(capability)) throw new BadRequestException(`El responsable necesita permiso ${capability}; configúralo en Equipo y permisos`);
    }
    return user;
  }
  private event(tx: Tx, actor: Actor, id: string, action: string, details: unknown, note = '') {
    return tx.quotationEvent.create({ data: { tenantId: actor.tenantId, quotationId: id, action, actorId: actor.id, actorName: actor.name, details: json(details), note } });
  }
  private bump(tx: Tx, row: Case, fields: Prisma.QuotationUpdateInput = {}) {
    return tx.quotation.update({ where: { id: row.id }, data: { ...fields, version: { increment: 1 } } });
  }
  private evidence(row: Case, id: string | undefined, purpose: string, revision?: number) {
    const file = row.attachments.find(a => a.id === id && a.purpose === purpose && (revision === undefined || a.revision === revision));
    if (!file) throw new BadRequestException(`Adjunta y selecciona evidencia de tipo ${purpose}${revision ? ` para la versión ${revision}` : ''}`);
    return file.id;
  }
  private async validateLines(tx: Tx, actor: Actor, lines: LineDto[]) {
    if (D(amount(lines)).gt('999999999999.99')) throw new BadRequestException('El total de la propuesta excede el límite de 999999999999.99');
    for (const line of lines) {
      required(line.description, 'Descripción de línea'); required(line.uom, 'Unidad'); quantity(line.quantity);
      if (line.route === 'MAKE' && !line.inventoryItemId) throw new BadRequestException('La fabricación requiere un artículo de inventario de salida');
      if (D(line.taxPct).gt(100)) throw new BadRequestException('El impuesto debe estar entre 0 y 100');
      if ((line.kind === 'SERVICE') !== (line.route === 'SERVICE')) throw new BadRequestException('La ruta debe corresponder al tipo de línea');
      if (line.route === 'STOCK' && !line.inventoryItemId) throw new BadRequestException('Las existencias requieren un artículo de inventario');
      if (line.inventoryItemId && !await tx.inventoryItem.findFirst({ where: { id: line.inventoryItemId, tenantId: actor.tenantId, status: 'ACTIVE' }, select: { id: true } })) throw new BadRequestException('Artículo de inventario inválido');
    }
  }
  private lineFields(l: LineDto, position: number) { return { position, kind: l.kind, route: l.route, description: l.description.trim(), uom: l.uom.trim(), quantity: D(l.quantity), unitPrice: D(l.unitPrice), taxPct: D(l.taxPct), inventoryItemId: l.inventoryItemId || null }; }
  private serialize(row: Case, actor: Actor) {
    const permissions = this.permissions(actor, row);
    return { ...row, attachments: row.attachments.filter(a => permissions.costs || !['SUPPLIER_QUOTE', 'SUPPLIER_PO'].includes(a.purpose)).map(({ storageKey, ...a }) => a), offers: permissions.costs ? row.offers : [],
      documents: row.documents.map(d => permissions.costs || !['PURCHASE', 'PRODUCTION'].includes(d.kind) ? d : { ...d, amount: null, note: '', evidenceId: null, items: (d.items as any[]).map(i => ({ lineId: i.lineId, quantity: i.quantity })) }),
      progress: progress(row.lines), permissions, total: amount(row.lines) };
  }
  async metadata() {
    const actor = await this.actor();
    const [users, access] = await Promise.all([
      this.db.user.findMany({ where: { tenantId: actor.tenantId }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } }),
      this.db.quotationAccess.findMany({ where: { tenantId: actor.tenantId }, select: { userId: true, capabilities: true } }),
    ]);
    return { userId: actor.id, users: users.map(u => ({ ...u, capabilities: u.role === 'ADMIN' ? [...CAPABILITIES] : access.find(a => a.userId === u.id)?.capabilities || [] })), permissions: this.permissions(actor) };
  }
  async access(dto: AccessDto) {
    const actor = await this.actor(); if (actor.role !== 'ADMIN') throw new ForbiddenException('Se requiere administración');
    return this.db.$transaction(async tx => {
      const user = await tx.user.findFirst({ where: { id: dto.userId, tenantId: actor.tenantId } });
      if (!user) throw new BadRequestException('Usuario inválido');
      if (user.role === 'VIEWER' && dto.capabilities.some(c => c !== 'READ')) throw new BadRequestException('Un usuario de consulta solo admite READ');
      const before = await tx.quotationAccess.findUnique({ where: { tenantId_userId: { tenantId: actor.tenantId, userId: dto.userId } } });
      const result = await tx.quotationAccess.upsert({ where: { tenantId_userId: { tenantId: actor.tenantId, userId: dto.userId } }, create: { tenantId: actor.tenantId, userId: dto.userId, capabilities: [...new Set(dto.capabilities)] }, update: { capabilities: [...new Set(dto.capabilities)] } });
      // Permission changes have an independent audit trail, including before the first case exists.
      await tx.quotationAccessEvent.create({ data: { tenantId: actor.tenantId, userId: dto.userId, actorId: actor.id, actorName: actor.name, before: before?.capabilities || [], after: result.capabilities } });
      return result;
    });
  }
  async list(query: ListDto) {
    const actor = await this.actor(), page = query.page || 1;
    const filters: Prisma.QuotationWhereInput[] = [{ tenantId: actor.tenantId }, this.visible(actor)];
    if (query.q?.trim()) filters.push({ OR: ['code', 'title', 'customerName', 'contactName'].map(key => ({ [key]: { contains: query.q!.trim(), mode: 'insensitive' } })) });
    if (query.status) filters.push({ status: query.status });
    if (query.view === 'mine') filters.push({ responsibleId: actor.id, status: { notIn: TERMINAL } });
    if (query.view === 'customer') filters.push({ status: 'AWAITING_APPROVAL' });
    if (query.view === 'supplier') filters.push({ OR: [{ status: 'SOURCING' }, { status: 'FULFILLMENT', lines: { some: { route: 'BUY', receivedQty: { lt: this.db.quotationLine.fields.orderedQty } } } }] });
    if (query.view === 'overdue') filters.push({ dueAt: { lt: new Date() }, status: { notIn: TERMINAL } });
    const where = { AND: filters };
    const [rows, total] = await Promise.all([this.db.quotation.findMany({ where, include: { lines: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 30, take: 30 }), this.db.quotation.count({ where })]);
    const items = rows.map(row => ({ ...row, total: amount(row.lines), progress: progress(row.lines) }));
    return { items, total, page, pages: Math.ceil(total / 30), permissions: this.permissions(actor) };
  }
  async detail(id: string) { const actor = await this.actor(); return this.serialize(await this.find(this.db, actor, id), actor); }
  async events(id: string, page: number) {
    const actor = await this.actor(), row = await this.find(this.db, actor, id), where = { tenantId: actor.tenantId, quotationId: id };
    const [items, total] = await Promise.all([this.db.quotationEvent.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 30, take: 30 }), this.db.quotationEvent.count({ where })]);
    return { items: items.map(e => !this.permissions(actor, row).costs && (['OFFER', 'SELECT_OFFER', 'PURCHASE', 'PRODUCTION'].includes(e.action) || e.action === 'ATTACHMENT' && ['SUPPLIER_QUOTE', 'SUPPLIER_PO'].includes(String((e.details as any)?.purpose))) ? { ...e, details: {}, note: 'Actividad de abastecimiento' } : e), total, page, pages: Math.ceil(total / 30) };
  }
  async references(id: string | null, kind: string, search = '') {
    const actor = await this.actor(); if (id) await this.find(this.db, actor, id); else if (kind !== 'inventory' || actor.role === 'VIEWER') throw new ForbiddenException('Sin permiso');
    const q = search.slice(0, 100), tenantId = actor.tenantId;
    if (kind === 'inventory') return this.db.inventoryItem.findMany({ where: { tenantId, status: 'ACTIVE', OR: [{ sku: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }, select: { id: true, sku: true, name: true }, take: 30 });
    if (kind === 'service') return this.db.workOrder.findMany({ where: { tenantId, kind: 'SERVICE_ORDER', title: { contains: q, mode: 'insensitive' } }, select: { id: true, title: true, status: true, assetCode: true }, take: 30, orderBy: { createdAt: 'desc' } });
    if (kind === 'manufacturing') return this.db.manufacturingOrder.findMany({ where: { tenantId, orderType: 'SPARE_PART', number: { contains: q, mode: 'insensitive' } }, select: { id: true, number: true, status: true, outputInventoryItemId: true }, take: 30, orderBy: { createdAt: 'desc' } });
    throw new BadRequestException('Tipo de referencia inválido');
  }
  async create(dto: CreateQuotationDto) {
    const actor = await this.actor(); if (actor.role === 'VIEWER') throw new ForbiddenException('Solo lectura');
    const row = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`quotations:${actor.tenantId}`}, 0))::text`;
      await this.person(tx, actor, dto.coordinatorId);
      if (actor.role !== 'ADMIN' && dto.coordinatorId !== actor.id) throw new ForbiddenException('Crea el expediente con tu usuario como coordinador');
      await this.validateLines(tx, actor, dto.lines);
      if (dto.assetId && !await tx.asset.findFirst({ where: { id: dto.assetId, tenantId: actor.tenantId }, select: { id: true } })) throw new BadRequestException('Activo inválido');
      const count = await tx.quotation.count({ where: { tenantId: actor.tenantId } });
      const row = await tx.quotation.create({ data: {
        tenantId: actor.tenantId, code: `COT-${String(count + 1).padStart(6, '0')}`, title: required(dto.title, 'Asunto'), customerName: required(dto.customerName, 'Cliente'),
        customerTaxId: dto.customerTaxId?.trim() || null, contactName: required(dto.contactName, 'Contacto'), contactEmail: dto.contactEmail || null, contactPhone: dto.contactPhone || null,
        description: required(dto.description, 'Solicitud'), currency: dto.currency, coordinatorId: dto.coordinatorId, responsibleId: dto.coordinatorId, createdById: actor.id,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null, assetId: dto.assetId || null,
      } });
      for (const [i, line] of dto.lines.entries()) await tx.quotationLine.create({ data: { ...this.lineFields(line, i + 1), tenantId: actor.tenantId, quotationId: row.id } });
      await this.event(tx, actor, row.id, 'CREATED', dto); return row;
    }, { isolationLevel: 'Serializable' });
    return this.detail(row.id);
  }
  async editLines(id: string, dto: EditLinesDto) {
    const actor = await this.actor();
    await this.locked(actor, id, dto.version, async (tx, row) => {
      this.can(actor, row, 'QUOTE'); this.draft(row); await this.validateLines(tx, actor, dto.lines);
      // Stable identities preserve supplier offers and historical revision references.
      const ids = dto.lines.map(l => l.id).filter(Boolean);
      if (new Set(ids).size !== ids.length || ids.some(v => !row.lines.some(l => l.id === v))) throw new BadRequestException('Líneas inválidas o repetidas');
      const removed = row.lines.filter(l => !ids.includes(l.id));
      if (removed.some(l => row.offers.some(o => o.lineId === l.id))) throw new ConflictException('Conserva las líneas que tienen ofertas de proveedor');
      for (const l of row.lines) await tx.quotationLine.update({ where: { id: l.id }, data: { position: -l.position } });
      await tx.quotationLine.deleteMany({ where: { tenantId: actor.tenantId, quotationId: id, id: { in: removed.map(l => l.id) } } });
      for (const [i, l] of dto.lines.entries()) {
        const fields = this.lineFields(l, i + 1);
        const old = row.lines.find(old => old.id === l.id);
        if (old && row.offers.some(o => o.lineId === old.id) && (old.kind !== l.kind || old.route !== l.route || old.inventoryItemId !== (l.inventoryItemId || null) || old.description !== l.description.trim())) throw new ConflictException('Una línea con ofertas conserva su artículo, descripción y ruta');
        if (l.id) await tx.quotationLine.update({ where: { id: l.id }, data: fields });
        else await tx.quotationLine.create({ data: { ...fields, quotationId: id, tenantId: actor.tenantId } });
      }
      await this.bump(tx, row); await this.event(tx, actor, id, 'LINES', { before: row.lines, after: dto.lines });
    }); return this.detail(id);
  }
  async offer(id: string, dto: OfferDto) {
    const actor = await this.actor();
    await this.locked(actor, id, dto.version, async (tx, row) => {
      this.can(actor, row, 'SOURCE'); this.active(row); if (!['REQUESTED', 'SOURCING', 'QUOTING', 'FULFILLMENT'].includes(row.status)) throw new ConflictException('La oferta solo se actualiza durante preparación o cumplimiento');
      const line = row.lines.find(l => l.id === dto.lineId && ['BUY', 'MAKE'].includes(l.route));
      if (!line) throw new BadRequestException('Selecciona una línea de compra o fabricación');
      this.evidence(row, dto.evidenceId, 'SUPPLIER_QUOTE');
      if (new Date(dto.validUntil) <= new Date()) throw new BadRequestException('La oferta debe estar vigente');
      const offer = await tx.quotationOffer.create({ data: { tenantId: actor.tenantId, quotationId: id, lineId: line.id,
        supplier: required(dto.supplier, 'Proveedor o fabricante'), reference: required(dto.reference, 'Referencia'), unitCost: D(dto.unitCost), currency: dto.currency,
        leadDays: dto.leadDays, validUntil: new Date(dto.validUntil), evidenceId: dto.evidenceId, createdById: actor.id } });
      await this.bump(tx, row); await this.event(tx, actor, id, 'OFFER', offer);
    }); return this.detail(id);
  }
  async selectOffer(id: string, offerId: string, version: number) {
    const actor = await this.actor();
    await this.locked(actor, id, version, async (tx, row) => {
      this.can(actor, row, 'SOURCE'); this.active(row); if (!['REQUESTED', 'SOURCING', 'QUOTING', 'FULFILLMENT'].includes(row.status)) throw new ConflictException('La oferta solo se actualiza durante preparación o cumplimiento');
      const offer = row.offers.find(o => o.id === offerId);
      if (!offer || offer.validUntil <= new Date()) throw new BadRequestException('Selecciona una oferta vigente');
      await tx.quotationOffer.updateMany({ where: { tenantId: actor.tenantId, quotationId: id, lineId: offer.lineId }, data: { selected: false } });
      await tx.quotationOffer.update({ where: { id: offerId }, data: { selected: true } });
      await this.bump(tx, row); await this.event(tx, actor, id, 'SELECT_OFFER', { offerId, lineId: offer.lineId });
    }); return this.detail(id);
  }
  async action(id: string, dto: ActionDto) {
    const actor = await this.actor();
    await this.locked(actor, id, dto.version, async (tx, row) => {
      if (actor.role === 'VIEWER') throw new ForbiddenException('Solo lectura');
      const data: Prisma.QuotationUpdateInput = {}, note = dto.note?.trim() || '';
      if (dto.action === 'COMMENT') { required(note, 'Comentario'); }
      else if (dto.action === 'RESUME') {
        this.manage(actor, row); if (row.status !== 'ON_HOLD' || !row.previousStatus) throw new ConflictException('El expediente no está en pausa');
        data.status = row.previousStatus; data.previousStatus = null; required(note, 'Motivo');
      } else {
        this.active(row);
        switch (dto.action) {
          case 'HANDOFF': this.manage(actor, row); required(dto.responsibleId, 'Nuevo responsable'); required(dto.area, 'Área'); required(note, 'Motivo del traspaso'); break;
          case 'SOURCE':
            this.can(actor, row, 'QUOTE'); this.draft(row);
            if (!row.lines.some(l => l.kind === 'PART' && l.route !== 'STOCK')) throw new BadRequestException('No hay líneas para cotizar con proveedor o manufactura');
            if (!row.attachments.some(a => a.purpose === 'REQUEST')) throw new BadRequestException('Adjunta la solicitud del cliente');
            data.status = 'SOURCING'; break;
          case 'PREPARE':
            if (!this.permissions(actor, row).capabilities.some(c => ['QUOTE', 'SOURCE'].includes(c))) throw new ForbiddenException('Sin permiso de cotización o abastecimiento');
            this.draft(row);
            if (!row.attachments.some(a => a.purpose === 'REQUEST')) throw new BadRequestException('Adjunta la solicitud del cliente');
            for (const l of row.lines.filter(l => ['BUY', 'MAKE'].includes(l.route))) if (!row.offers.some(o => o.lineId === l.id && o.selected && o.validUntil > new Date())) throw new BadRequestException(`Selecciona una oferta vigente para ${l.description}`);
            data.status = 'QUOTING'; break;
          case 'SEND': {
            this.can(actor, row, 'QUOTE');
            if (row.status !== 'QUOTING') throw new ConflictException('Primero prepara la cotización');
            if (!dto.validUntil || new Date(dto.validUntil) <= new Date()) throw new BadRequestException('Define una vigencia futura');
            for (const l of row.lines.filter(l => ['BUY', 'MAKE'].includes(l.route))) if (!row.offers.some(o => o.lineId === l.id && o.selected && o.validUntil > new Date())) throw new BadRequestException(`La oferta para ${l.description} debe estar vigente`);
            if (row.lines.some(l => l.unitPrice.lte(0))) throw new BadRequestException('Todas las líneas requieren un precio de venta mayor que cero');
            const number = row.currentRevision + 1, evidenceId = this.evidence(row, dto.evidenceId, 'CUSTOMER_QUOTE', number);
            const snapshot = { customerName: row.customerName, customerTaxId: row.customerTaxId, contactName: row.contactName, currency: row.currency,
              title: row.title, description: row.description, lines: row.lines.map(l => ({ id: l.id, position: l.position, kind: l.kind, description: l.description, uom: l.uom, quantity: l.quantity.toString(), unitPrice: l.unitPrice.toString(), taxPct: l.taxPct.toString() })) };
            await tx.quotationRevision.create({ data: { tenantId: actor.tenantId, quotationId: id, number, snapshot: json(snapshot), total: amount(row.lines),
              validUntil: new Date(dto.validUntil), terms: required(dto.terms, 'Condiciones comerciales'), sentTo: required(dto.sentTo, 'Destinatario y constancia de envío'), evidenceId, createdById: actor.id } });
            data.currentRevision = number; data.status = 'AWAITING_APPROVAL'; break;
          }
          case 'REVISE': this.can(actor, row, 'QUOTE'); if (row.status !== 'AWAITING_APPROVAL') throw new ConflictException('Solo se devuelve una cotización pendiente de respuesta'); required(note, 'Cambios solicitados'); data.status = 'QUOTING'; break;
          case 'APPROVE': {
            this.can(actor, row, 'QUOTE');
            if (row.status !== 'AWAITING_APPROVAL') throw new ConflictException('No hay cotización pendiente de aprobación');
            const revision = row.revisions.find(r => r.number === row.currentRevision);
            if (!revision || revision.validUntil < new Date()) throw new ConflictException('La cotización venció; emite una nueva versión');
            const evidenceId = this.evidence(row, dto.evidenceId, 'CUSTOMER_PO', row.currentRevision);
            if (!dto.items?.length || new Set(dto.items.map(i => i.lineId)).size !== dto.items.length) throw new BadRequestException('Selecciona cantidades aprobadas sin repetir líneas');
            const selected = dto.items.map(i => {
              const l = row.lines.find(l => l.id === i.lineId); if (!l) throw new BadRequestException('Línea inválida');
              const qty = quantity(i.quantity); remaining(l.quantity, 0, qty, 'Aprobación'); return { ...l, quantity: qty };
            });
            const total = amount(selected);
            if (!dto.amount || !D(dto.amount).eq(total)) throw new BadRequestException(`La OC debe coincidir con el total aprobado: ${total} ${row.currency}`);
            for (const l of selected) await tx.quotationLine.update({ where: { id: l.id }, data: { approvedQty: l.quantity } });
            await tx.quotationDocument.create({ data: { tenantId: actor.tenantId, quotationId: id, kind: 'CUSTOMER_PO', reference: required(dto.reference, 'Número de OC del cliente'), revision: row.currentRevision,
              evidenceId, date: new Date(), note: required(note, 'Verificación de cliente, alcance y valores de la OC'), items: json(dto.items), amount: D(total), createdById: actor.id } });
            data.approvedRevision = row.currentRevision; data.status = 'FULFILLMENT'; break;
          }
          case 'REJECT': this.can(actor, row, 'QUOTE'); if (row.approvedRevision) throw new ConflictException('El expediente ya tiene aprobación'); required(note, 'Motivo del rechazo'); data.status = 'REJECTED'; break;
          case 'HOLD': this.manage(actor, row); required(note, 'Motivo de pausa'); data.previousStatus = row.status; data.status = 'ON_HOLD'; break;
          case 'CANCEL': this.manage(actor, row); required(note, 'Motivo de cancelación'); if (row.documents.some(d => d.kind !== 'CUSTOMER_PO')) throw new ConflictException('Existen compromisos operativos: resuélvelos antes de cancelar'); data.status = 'CANCELED'; break;
          case 'CLOSE': this.manage(actor, row); if (!progress(row.lines).complete) throw new ConflictException('Completa la facturación y la ejecución o entrega de todas las cantidades aprobadas'); data.status = 'CLOSED'; break;
          default: throw new BadRequestException('Acción inválida');
        }
      }
      if (dto.responsibleId || dto.area || dto.dueAt) {
        if (!['HANDOFF', 'SOURCE', 'PREPARE', 'SEND', 'APPROVE', 'REVISE', 'RESUME'].includes(dto.action) || !(this.permissions(actor, row).manage || row.responsibleId === actor.id)) throw new ForbiddenException('No puedes cambiar el responsable o plazo con esta acción');
      }
      if (dto.responsibleId || dto.area) {
        const area = dto.area || row.area, nextId = dto.responsibleId || row.responsibleId;
        await this.person(tx, actor, nextId, nextId === row.coordinatorId && area === 'TECHNICAL' ? undefined : areaCapability[area]);
        data.responsibleId = nextId; data.area = area;
      }
      if (dto.dueAt) data.dueAt = new Date(dto.dueAt);
      await this.bump(tx, row, data);
      await this.event(tx, actor, id, dto.action, { from: row.status, to: data.status || row.status, previousResponsibleId: row.responsibleId, responsibleId: dto.responsibleId || row.responsibleId, area: dto.area || row.area, dueAt: dto.dueAt || row.dueAt, revision: row.currentRevision, evidenceId: dto.evidenceId || null }, note);
    }); return this.detail(id);
  }
  async link(id: string, dto: LinkDto) {
    const actor = await this.actor();
    await this.locked(actor, id, dto.version, async (tx, row) => {
      this.active(row); if (row.status !== 'FULFILLMENT') throw new ConflictException('Primero valida la OC del cliente');
      const line = row.lines.find(l => l.id === dto.lineId && l.approvedQty.gt(0)); if (!line) throw new BadRequestException('Línea no aprobada');
      if (!!dto.serviceOrderId === !!dto.manufacturingOrderId) throw new BadRequestException('Selecciona una orden');
      if (dto.serviceOrderId) {
        this.can(actor, row, 'SERVICE');
        if (line.kind !== 'SERVICE' || line.serviceOrderId) throw new ConflictException('Selecciona un servicio sin OS vinculada');
        const order = await tx.workOrder.findFirst({ where: { id: dto.serviceOrderId, tenantId: actor.tenantId, kind: 'SERVICE_ORDER', status: { not: 'CANCELED' } }, include: { assignments: true } });
        if (!order) throw new BadRequestException('OS inválida');
        if (row.assetId) { const asset = await tx.asset.findFirst({ where: { id: row.assetId, tenantId: actor.tenantId } }); if (asset?.code !== order.assetCode) throw new BadRequestException('La OS debe corresponder al activo del expediente'); }
        if (actor.role !== 'ADMIN' && !order.assignments.some(a => a.userId === actor.id && a.state === 'ACTIVE')) throw new ForbiddenException('Debes estar asignado a la OS');
        await tx.quotationLine.update({ where: { id: line.id }, data: { serviceOrderId: order.id } });
      } else {
        this.can(actor, row, 'SOURCE');
        if (line.route !== 'MAKE' || line.manufacturingOrderId || !line.inventoryItemId) throw new ConflictException('Selecciona una fabricación con artículo y sin OF vinculada');
        const order = await tx.manufacturingOrder.findFirst({ where: { id: dto.manufacturingOrderId, tenantId: actor.tenantId, orderType: 'SPARE_PART', outputInventoryItemId: line.inventoryItemId, status: { not: 'CANCELED' } } });
        if (!order || D(order.quantity).lt(line.approvedQty)) throw new BadRequestException('OF inválida o cantidad insuficiente');
        if (await tx.quotationLine.findFirst({ where: { tenantId: actor.tenantId, manufacturingOrderId: order.id } })) throw new ConflictException('La OF ya pertenece a otro compromiso de cotización');
        await tx.quotationLine.update({ where: { id: line.id }, data: { manufacturingOrderId: order.id } });
      }
      await this.bump(tx, row); await this.event(tx, actor, id, 'LINK', dto);
    }); return this.detail(id);
  }
  async document(id: string, dto: DocumentDto) {
    const actor = await this.actor();
    await this.locked(actor, id, dto.version, async (tx, row) => {
      this.active(row); if (row.status !== 'FULFILLMENT' || !row.approvedRevision) throw new ConflictException('Primero valida la OC del cliente');
      const capability: Record<string, string> = { PURCHASE: 'PURCHASE', PRODUCTION: 'SOURCE', RECEIPT: 'RECEIVE', SERVICE: 'SERVICE', INVOICE: 'INVOICE', DISPATCH: 'DISPATCH', DELIVERY: 'DISPATCH' };
      this.can(actor, row, capability[dto.kind]);
      const handoff: Prisma.QuotationUpdateInput = {};
      if (dto.responsibleId || dto.area || dto.dueAt) {
        if (!(this.permissions(actor, row).manage || row.responsibleId === actor.id)) throw new ForbiddenException('Solo el responsable actual o coordinador puede traspasar la gestión');
        const nextId = dto.responsibleId || row.responsibleId, area = dto.area || row.area;
        await this.person(tx, actor, nextId, nextId === row.coordinatorId && area === 'TECHNICAL' ? undefined : areaCapability[area]);
        handoff.responsibleId = nextId; handoff.area = area; if (dto.dueAt) handoff.dueAt = new Date(dto.dueAt);
      }
      const purpose: Record<string, string> = { PURCHASE: 'SUPPLIER_PO', PRODUCTION: 'SUPPLIER_PO', RECEIPT: 'RECEIPT', SERVICE: 'SERVICE', INVOICE: 'INVOICE', DISPATCH: 'DELIVERY', DELIVERY: 'DELIVERY' };
      this.evidence(row, dto.evidenceId, purpose[dto.kind]);
      const reference = required(dto.reference, 'Referencia del documento');
      if (new Date(dto.date) > new Date()) throw new BadRequestException('La fecha del documento no puede estar en el futuro');
      if (await tx.quotationDocument.findFirst({ where: { tenantId: actor.tenantId, quotationId: id, kind: dto.kind, reference } })) throw new ConflictException('Este documento ya está registrado');
      if (new Set(dto.items.map(i => i.lineId)).size !== dto.items.length) throw new BadRequestException('No repitas líneas');
      const selected = dto.items.map(i => {
        const line = row.lines.find(l => l.id === i.lineId && l.approvedQty.gt(0)); if (!line) throw new BadRequestException('Línea no aprobada');
        return { line, qty: quantity(i.quantity) };
      });
      const docId = randomUUID(), recorded: any[] = []; let supplier: string | null = null, supplierCurrency: string | null = null;
      for (const { line: l, qty } of selected) {
        const update: Prisma.QuotationLineUpdateInput = {};
        if (['PURCHASE', 'PRODUCTION'].includes(dto.kind)) {
          if (l.route !== (dto.kind === 'PURCHASE' ? 'BUY' : 'MAKE')) throw new BadRequestException('La ruta de suministro no corresponde al documento');
          remaining(l.approvedQty, l.orderedQty, qty, 'Compra o fabricación');
          const offer = row.offers.find(o => o.lineId === l.id && o.selected);
          if (!offer || offer.validUntil < new Date()) throw new ConflictException('La oferta del proveedor venció; registra una renovación antes de emitir la orden');
          if (supplier && (supplier !== offer.supplier || supplierCurrency !== offer.currency)) throw new BadRequestException('Cada orden debe corresponder a un único proveedor y moneda'); supplier = offer.supplier; supplierCurrency = offer.currency;
          if (dto.kind === 'PRODUCTION' && !l.manufacturingOrderId) throw new BadRequestException('Vincula primero la orden de fabricación');
          update.orderedQty = { increment: qty };
          recorded.push({ lineId: l.id, quantity: qty.toString(), offerId: offer.id, unitCost: offer.unitCost.toString(), currency: offer.currency, leadDays: offer.leadDays, manufacturingOrderId: l.manufacturingOrderId });
        } else if (dto.kind === 'RECEIPT') {
          if (l.kind !== 'PART') throw new BadRequestException('Solo se reciben repuestos');
          remaining(l.approvedQty, l.receivedQty, qty, 'Recepción');
          if (l.route !== 'STOCK') {
            remaining(l.orderedQty, l.receivedQty, qty, 'Recepción de la compra');
            const source = row.documents.find(d => d.id === dto.sourceDocumentId && d.kind === (l.route === 'BUY' ? 'PURCHASE' : 'PRODUCTION'));
            if (!source) throw new BadRequestException('Selecciona la orden de origen');
            const sourceItem = (source.items as any[]).find(i => i.lineId === l.id);
            const used = row.documents.filter(d => d.kind === 'RECEIPT' && d.sourceDocumentId === source.id).reduce((sum, d) => sum.add((d.items as any[]).find(i => i.lineId === l.id)?.quantity || '0'), D(0));
            remaining(sourceItem?.quantity || '0', used, qty, 'Recepción de esa orden');
          }
          if (l.route === 'MAKE') {
            await this.available(tx, actor, l.inventoryItemId!, qty);
            const receipts = await tx.manufacturingOutputReceipt.aggregate({ where: { tenantId: actor.tenantId, manufacturingOrderId: l.manufacturingOrderId! }, _sum: { quantity: true } });
            remaining(receipts._sum.quantity || 0, l.receivedQty, qty, 'Producto terminado recibido desde manufactura');
          } else if (l.inventoryItemId && l.route === 'BUY') {
            await this.inventoryLock(tx, actor, l.inventoryItemId);
            await this.ledger.receiveInventory(tx, { tenantId: actor.tenantId, inventoryItemId: l.inventoryItemId, qty: qty.toNumber(), source: 'SYSTEM', referenceType: 'QUOTATION_RECEIPT', referenceId: docId, referenceLabel: `${row.code} / ${reference}`, createdByUserId: actor.id });
          } else if (l.route === 'STOCK') { await this.available(tx, actor, l.inventoryItemId!, qty); }
          update.receivedQty = { increment: qty };
        } else if (dto.kind === 'SERVICE') {
          if (l.kind !== 'SERVICE' || !l.serviceOrderId) throw new BadRequestException('Vincula una OS al servicio');
          const order = await tx.workOrder.findFirst({ where: { id: l.serviceOrderId, tenantId: actor.tenantId, status: { in: ['COMPLETED', 'CLOSED'] } } });
          if (!order) throw new ConflictException('La OS debe estar completada o cerrada');
          remaining(l.approvedQty, l.executedQty, qty, 'Ejecución'); update.executedQty = { increment: qty };
        } else if (dto.kind === 'INVOICE') {
          remaining(l.kind === 'PART' ? l.receivedQty : l.executedQty, l.invoicedQty, qty, 'Facturación'); update.invoicedQty = { increment: qty };
        } else if (dto.kind === 'DISPATCH') {
          if (l.kind !== 'PART') throw new BadRequestException('Solo se despachan repuestos');
          remaining(l.invoicedQty, l.dispatchedQty, qty, 'Despacho facturado');
          remaining(l.receivedQty, l.dispatchedQty, qty, 'Despacho recibido');
          if (l.inventoryItemId) {
            const allocations = await this.available(tx, actor, l.inventoryItemId, qty, l.id);
            await this.ledger.consumeInventory(tx, { tenantId: actor.tenantId, inventoryItemId: l.inventoryItemId, qty: qty.toNumber(), source: 'SYSTEM', referenceType: 'QUOTATION_DISPATCH', referenceId: docId, referenceLabel: `${row.code} / ${reference}`, createdByUserId: actor.id, preferredStockBreakdown: allocations });
          }
          update.dispatchedQty = { increment: qty };
        } else if (dto.kind === 'DELIVERY') {
          if (l.kind !== 'PART') throw new BadRequestException('Solo se confirma entrega de repuestos');
          remaining(l.dispatchedQty, l.deliveredQty, qty, 'Confirmación de entrega'); update.deliveredQty = { increment: qty };
        }
        await tx.quotationLine.update({ where: { id: l.id }, data: update });
        if (!['PURCHASE', 'PRODUCTION'].includes(dto.kind)) recorded.push({ lineId: l.id, quantity: qty.toString(), serviceOrderId: l.serviceOrderId });
      }
      let total: string | null = dto.amount || null;
      if (dto.kind === 'INVOICE') {
        const expected = amount(selected.map(({ line, qty }) => ({ ...line, quantity: qty })));
        if (!dto.amount || !D(dto.amount).eq(expected)) throw new BadRequestException(`El valor de la factura debe ser ${expected} ${row.currency}`); total = expected;
      }
      await tx.quotationDocument.create({ data: { id: docId, tenantId: actor.tenantId, quotationId: id, kind: dto.kind, reference, revision: row.approvedRevision,
        evidenceId: dto.evidenceId, date: new Date(dto.date), note: dto.note?.trim() || '', items: json(recorded), supplier, sourceDocumentId: dto.sourceDocumentId || null, amount: total ? D(total) : null, createdById: actor.id } });
      await this.bump(tx, row, handoff); await this.event(tx, actor, id, dto.kind, { documentId: docId, reference, items: recorded, evidenceId: dto.evidenceId, previousResponsibleId: row.responsibleId, responsibleId: handoff.responsibleId || row.responsibleId, area: handoff.area || row.area }, dto.note);
    }); return this.detail(id);
  }
  private async inventoryLock(tx: Tx, actor: Actor, inventoryItemId: string) {
    await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${inventoryItemId} AND "tenantId" = ${actor.tenantId} FOR UPDATE`;
  }
  private async available(tx: Tx, actor: Actor, inventoryItemId: string, qty: Prisma.Decimal, excludeLineId?: string) {
    await this.inventoryLock(tx, actor, inventoryItemId);
    const item = await tx.inventoryItem.findFirst({ where: { tenantId: actor.tenantId, id: inventoryItemId }, include: { stocks: true } });
    if (!item) throw new BadRequestException('Artículo no encontrado');
    const reservations = await tx.manufacturingStockReservation.findMany({ where: { tenantId: actor.tenantId, inventoryItemId, status: 'ACTIVE' }, select: { inventoryStockId: true, reservedQuantity: true, issuedQuantity: true, releasedQuantity: true } });
    const blocked = reservations.reduce((sum, r) => sum.add(r.reservedQuantity.sub(r.issuedQuantity).sub(r.releasedQuantity)), D(0));
    const onHand = item.stocks.length ? item.stocks.reduce((sum, s) => sum.add(s.stockOnHand), D(0)) : D(item.qty);
    const commitments = await tx.quotationLine.findMany({ where: { tenantId: actor.tenantId, inventoryItemId, ...(excludeLineId ? { id: { not: excludeLineId } } : {}), quotation: { status: { in: ['FULFILLMENT', 'ON_HOLD'] } } }, select: { receivedQty: true, dispatchedQty: true } });
    const committed = commitments.reduce((sum, line) => sum.add(line.receivedQty.sub(line.dispatchedQty)), D(0));
    if (onHand.sub(blocked).sub(committed).lt(qty)) throw new ConflictException('No hay existencias disponibles suficientes para esta operación');
    // Pick bins without taking quantities reserved for manufacturing.
    if (!item.stocks.length) return undefined;
    let left = qty; const allocations: { inventoryStockId: string; qty: number }[] = [];
    for (const stock of item.stocks) {
      const reserved = reservations.filter(r => r.inventoryStockId === stock.id).reduce((sum, r) => sum.add(r.reservedQuantity.sub(r.issuedQuantity).sub(r.releasedQuantity)), D(0));
      const free = D(stock.stockOnHand).sub(reserved);
      if (free.lte(0) || left.lte(0)) continue;
      const take = Prisma.Decimal.min(free, left); allocations.push({ inventoryStockId: stock.id, qty: take.toNumber() }); left = left.sub(take);
    }
    if (left.gt(0)) throw new ConflictException('No hay saldo libre suficiente en las ubicaciones de inventario');
    return allocations;
  }
  async upload(id: string, dto: UploadDto, file?: { buffer: Buffer; originalname: string; size: number }) {
    const actor = await this.actor(), info = documentFile(file), storageKey = randomUUID();
    if (actor.role === 'VIEWER') throw new ForbiddenException('Solo lectura');
    await fs.mkdir(storage(), { recursive: true }); await fs.writeFile(join(storage(), storageKey), file!.buffer, { flag: 'wx' });
    try {
      await this.locked(actor, id, dto.version, async (tx, row) => {
        this.active(row);
        const cap: Record<string, string> = { SUPPLIER_QUOTE: 'SOURCE', SUPPLIER_PO: 'PURCHASE', RECEIPT: 'RECEIVE', SERVICE: 'SERVICE', INVOICE: 'INVOICE', DELIVERY: 'DISPATCH', CUSTOMER_QUOTE: 'QUOTE', CUSTOMER_PO: 'QUOTE', REQUEST: 'QUOTE', OTHER: 'QUOTE' };
        // Manufacturing also attaches internal production orders.
        if (!(dto.purpose === 'SUPPLIER_PO' && this.permissions(actor, row).capabilities.includes('SOURCE'))) this.can(actor, row, cap[dto.purpose]);
        if (['CUSTOMER_QUOTE', 'CUSTOMER_PO'].includes(dto.purpose) && dto.revision !== (dto.purpose === 'CUSTOMER_QUOTE' ? row.currentRevision + 1 : row.currentRevision)) throw new BadRequestException('Selecciona la revisión correspondiente a este documento');
        const attachment = await tx.quotationAttachment.create({ data: { ...info, storageKey, tenantId: actor.tenantId, quotationId: id, purpose: dto.purpose, revision: dto.revision || null, createdById: actor.id } });
        await this.bump(tx, row); await this.event(tx, actor, id, 'ATTACHMENT', { id: attachment.id, filename: info.filename, purpose: dto.purpose, revision: dto.revision, sha256: info.sha256 });
      });
    } catch (error) { await fs.unlink(join(storage(), storageKey)).catch(() => {}); throw error; }
    return this.detail(id);
  }
  async file(id: string, fileId: string) {
    const actor = await this.actor(), row = await this.find(this.db, actor, id), file = row.attachments.find(a => a.id === fileId);
    if (!file) throw new NotFoundException('Evidencia no encontrada');
    if (['SUPPLIER_QUOTE', 'SUPPLIER_PO'].includes(file.purpose) && !this.permissions(actor, row).costs) throw new ForbiddenException('Sin permiso para documentos de costos');
    return { ...file, path: join(storage(), file.storageKey) };
  }
}
