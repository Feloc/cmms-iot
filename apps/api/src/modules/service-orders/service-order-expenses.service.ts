import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import {
  expenseBody, expenseVersion, expenseReceipt, expenseReceiptPath, EXPENSE_CATEGORIES,
  EXPENSE_RECEIPT_MAX_COUNT, EXPENSE_RECEIPT_BATCH_BYTES,
} from './service-order-expenses.domain';
import type { DispatchDocumentFile } from '../manufacturing/manufacturing-dispatch-files';

const expenseInclude = {
  receipts: { select: { id: true, filename: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
  events: { select: { id: true, action: true, actorName: true, createdAt: true, details: true }, orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.ServiceOrderExpenseInclude;
type Expense = Prisma.ServiceOrderExpenseGetPayload<{ include: typeof expenseInclude }>;
type Actor = { tenantId: string; id: string; name: string; role: string };

@Injectable()
export class ServiceOrderExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  private async access(db: Prisma.TransactionClient, workOrderId: string): Promise<Actor> {
    const { tenantId, userId } = tenantStorage.getStore() || {};
    if (!tenantId || !userId) throw new ForbiddenException('Inicia sesión para consultar los gastos');
    const actor = await db.user.findFirst({ where: { tenantId, id: userId }, select: { id: true, name: true, role: true } });
    if (!actor || !['ADMIN', 'TECH'].includes(actor.role)) throw new ForbiddenException('No tienes acceso a los gastos del servicio');
    const order = await db.workOrder.findFirst({
      where: { id: workOrderId, tenantId, kind: 'SERVICE_ORDER' },
      select: { id: true, assignments: { where: { tenantId, userId, state: 'ACTIVE' }, select: { id: true } } },
    });
    if (!order) throw new NotFoundException('Orden de servicio no encontrada');
    if (actor.role !== 'ADMIN' && !order.assignments.length) throw new ForbiddenException('Debes estar asignado al servicio para gestionar sus gastos');
    return { ...actor, tenantId };
  }

  private async find(db: Prisma.TransactionClient, actor: Actor, workOrderId: string, expenseId: string) {
    const expense = await db.serviceOrderExpense.findFirst({ where: { id: expenseId, tenantId: actor.tenantId, workOrderId }, include: expenseInclude });
    if (!expense) throw new NotFoundException('Gasto no encontrado en este servicio');
    return expense;
  }

  private canEdit(expense: { createdByUserId: string; voidedAt: Date | null }, actor: Actor) {
    return !expense.voidedAt && (actor.role === 'ADMIN' || expense.createdByUserId === actor.id);
  }

  private assertEdit(expense: Expense, actor: Actor) {
    if (expense.voidedAt) throw new ConflictException('El gasto está anulado');
    if (!this.canEdit(expense, actor)) throw new ForbiddenException('Solo puedes modificar tus propios gastos');
  }

  private snapshot(expense: { expenseDate: Date; category: string; description: string; amount: Prisma.Decimal; paidBy: string }) {
    return { expenseDate: expense.expenseDate.toISOString().slice(0, 10), category: expense.category, description: expense.description, amount: expense.amount.toFixed(2), paidBy: expense.paidBy };
  }

  private async event(db: Prisma.TransactionClient, actor: Actor, expenseId: string, action: string, details: Prisma.InputJsonObject) {
    await db.serviceOrderExpenseEvent.create({ data: { tenantId: actor.tenantId, expenseId, action, actorUserId: actor.id, actorName: actor.name, details } });
  }

  private async bump(db: Prisma.TransactionClient, actor: Actor, expense: Expense, version: number, data: Prisma.ServiceOrderExpenseUpdateManyMutationInput = {}) {
    const result = await db.serviceOrderExpense.updateMany({
      where: { id: expense.id, tenantId: actor.tenantId, workOrderId: expense.workOrderId, version, voidedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count !== 1) throw new ConflictException('El gasto cambió. Actualiza la sección antes de continuar');
  }

  private serialize(expense: Expense, actor: Actor) {
    return { ...expense, expenseDate: expense.expenseDate.toISOString().slice(0, 10), amount: expense.amount.toFixed(2), canEdit: this.canEdit(expense, actor) };
  }

  async authorizeReceiptUpload(workOrderId: string, expenseId: string) {
    const actor = await this.access(this.prisma, workOrderId);
    this.assertEdit(await this.find(this.prisma, actor, workOrderId, expenseId), actor);
  }

  async list(workOrderId: string) {
    return this.prisma.$transaction(async db => {
      const actor = await this.access(db, workOrderId);
      const expenses = await db.serviceOrderExpense.findMany({ where: { tenantId: actor.tenantId, workOrderId }, include: expenseInclude, orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }] });
      const active = expenses.filter(expense => !expense.voidedAt);
      const sum = (rows: Expense[]) => rows.reduce((total, expense) => total.plus(expense.amount), new Prisma.Decimal(0)).toFixed(2);
      return {
        items: expenses.map(expense => this.serialize(expense, actor)), canCreate: true, currency: 'COP',
        summary: {
          total: sum(active), employeePaid: sum(active.filter(expense => expense.paidBy === 'EMPLOYEE')),
          companyPaid: sum(active.filter(expense => expense.paidBy === 'COMPANY')),
          count: active.length, withoutReceipts: active.filter(expense => !expense.receipts.length).length,
          byCategory: Object.entries(EXPENSE_CATEGORIES).map(([category, label]) => ({ category, label, total: sum(active.filter(expense => expense.category === category)) })),
        },
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async create(workOrderId: string, body: unknown) {
    const input = expenseBody(body);
    if (Object.prototype.hasOwnProperty.call(body, 'version')) throw new BadRequestException('No envíes versión al crear un gasto');
    return this.prisma.$transaction(async db => {
      const actor = await this.access(db, workOrderId);
      const expense = await db.serviceOrderExpense.create({ data: { ...input, tenantId: actor.tenantId, workOrderId, createdByUserId: actor.id, createdByName: actor.name } });
      await this.event(db, actor, expense.id, 'CREATED', { after: this.snapshot(expense) });
      return this.serialize(await this.find(db, actor, workOrderId, expense.id), actor);
    });
  }

  async update(workOrderId: string, expenseId: string, body: unknown) {
    const input = expenseBody(body);
    const version = expenseVersion(body);
    return this.prisma.$transaction(async db => {
      const actor = await this.access(db, workOrderId);
      const expense = await this.find(db, actor, workOrderId, expenseId);
      this.assertEdit(expense, actor);
      await this.bump(db, actor, expense, version, input);
      await this.event(db, actor, expense.id, 'UPDATED', { before: this.snapshot(expense), after: this.snapshot(input) });
      return this.serialize(await this.find(db, actor, workOrderId, expenseId), actor);
    });
  }

  async void(workOrderId: string, expenseId: string, body: unknown) {
    const version = expenseVersion(body, true);
    return this.prisma.$transaction(async db => {
      const actor = await this.access(db, workOrderId);
      const expense = await this.find(db, actor, workOrderId, expenseId);
      this.assertEdit(expense, actor);
      await this.bump(db, actor, expense, version, { voidedAt: new Date() });
      await this.event(db, actor, expense.id, 'VOIDED', { before: this.snapshot(expense) });
      return { ok: true };
    });
  }

  async addReceipts(workOrderId: string, expenseId: string, files: DispatchDocumentFile[]) {
    if (!files?.length || files.length > EXPENSE_RECEIPT_MAX_COUNT) throw new BadRequestException('Selecciona entre 1 y 10 soportes');
    if (files.reduce((sum, file) => sum + (file.buffer?.length || 0), 0) > EXPENSE_RECEIPT_BATCH_BYTES) throw new BadRequestException('La carga de soportes supera 30 MB');
    const metadata = files.map(expenseReceipt);
    const written: string[] = [];
    try {
      return await this.prisma.$transaction(async db => {
        const actor = await this.access(db, workOrderId);
        const expense = await this.find(db, actor, workOrderId, expenseId);
        this.assertEdit(expense, actor);
        if (expense.receipts.length + files.length > EXPENSE_RECEIPT_MAX_COUNT) throw new BadRequestException('Cada gasto admite máximo 10 soportes');
        await this.bump(db, actor, expense, expense.version);
        const receipts: { id: string; filename: string; mimeType: string; size: number }[] = [];
        for (let index = 0; index < files.length; index++) {
          const meta = metadata[index];
          const target = expenseReceiptPath(meta.storageKey);
          await fs.mkdir(path.dirname(target), { recursive: true });
          const handle = await fs.open(target, 'wx', 0o600);
          written.push(target);
          try { await handle.writeFile(files[index].buffer); }
          finally { await handle.close(); }
          const receipt = await db.attachment.create({ data: {
            tenantId: actor.tenantId, workOrderId, expenseId,
            type: meta.mimeType.startsWith('image/') ? 'IMAGE' : 'DOCUMENT', filename: meta.filename,
            mimeType: meta.mimeType, size: meta.size, url: meta.storageKey, createdBy: actor.id,
          }, select: { id: true, filename: true, mimeType: true, size: true } });
          receipts.push(receipt);
        }
        await this.event(db, actor, expenseId, 'RECEIPTS_ADDED', { receipts });
        return { items: receipts };
      }, { timeout: 15000 });
    } catch (error) {
      await Promise.all(written.map(target => fs.unlink(target).catch(() => undefined)));
      throw error;
    }
  }

  async receipt(workOrderId: string, expenseId: string, receiptId: string) {
    const actor = await this.access(this.prisma, workOrderId);
    const receipt = await this.prisma.attachment.findFirst({ where: { id: receiptId, tenantId: actor.tenantId, workOrderId, expenseId }, select: { url: true, filename: true, mimeType: true } });
    if (!receipt) throw new NotFoundException('Soporte no encontrado en este gasto');
    const target = expenseReceiptPath(receipt.url);
    try {
      // Open before sending headers; FileHandle avoids a stat/open race.
      const handle = await fs.open(target, 'r');
      return { handle, filename: receipt.filename, mimeType: receipt.mimeType };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundException('El archivo del soporte no está disponible');
      throw error;
    }
  }

  async removeReceipt(workOrderId: string, expenseId: string, receiptId: string) {
    const storageKey = await this.prisma.$transaction(async db => {
      const actor = await this.access(db, workOrderId);
      const expense = await this.find(db, actor, workOrderId, expenseId);
      this.assertEdit(expense, actor);
      const receipt = await db.attachment.findFirst({ where: { id: receiptId, tenantId: actor.tenantId, workOrderId, expenseId } });
      if (!receipt) throw new NotFoundException('Soporte no encontrado en este gasto');
      await this.bump(db, actor, expense, expense.version);
      await db.attachment.delete({ where: { id: receipt.id, tenantId: actor.tenantId } });
      await this.event(db, actor, expenseId, 'RECEIPT_REMOVED', { receipt: { id: receipt.id, filename: receipt.filename } });
      return receipt.url;
    });
    await fs.unlink(expenseReceiptPath(storageKey)).catch(() => undefined);
    return { ok: true };
  }

  async export(workOrderId: string) {
    const data = await this.list(workOrderId);
    const rows = data.items.map(expense => ({
      'ID gasto': expense.id, 'Orden de servicio': workOrderId, Fecha: expense.expenseDate,
      Categoría: EXPENSE_CATEGORIES[expense.category], Concepto: expense.description,
      Valor: Number(expense.amount), Moneda: expense.currency,
      'Pagado por': expense.paidBy === 'EMPLOYEE' ? 'Colaborador' : 'Empresa',
      Responsable: expense.createdByName, Estado: expense.voidedAt ? 'Anulado' : 'Registrado',
      Soportes: expense.receipts.map(receipt => receipt.filename).join('; ') || 'Sin soporte',
    }));
    const summary = [
      { Concepto: 'Total de gastos vigentes', Valor: Number(data.summary.total), Moneda: 'COP' },
      { Concepto: 'Pagado por colaboradores', Valor: Number(data.summary.employeePaid), Moneda: 'COP' },
      { Concepto: 'Pagado por la empresa', Valor: Number(data.summary.companyPaid), Moneda: 'COP' },
      ...data.summary.byCategory.map(category => ({ Concepto: category.label, Valor: Number(category.total), Moneda: 'COP' })),
    ];
    const history = data.items.flatMap(expense => expense.events.map(event => ({ 'ID gasto': expense.id, Fecha: event.createdAt.toISOString(), Acción: event.action, Responsable: event.actorName, Detalle: JSON.stringify(event.details) })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: ['ID gasto', 'Orden de servicio', 'Fecha', 'Categoría', 'Concepto', 'Valor', 'Moneda', 'Pagado por', 'Responsable', 'Estado', 'Soportes'] }), 'Gastos');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), 'Resumen');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(history, { header: ['ID gasto', 'Fecha', 'Acción', 'Responsable', 'Detalle'] }), 'Historial');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
