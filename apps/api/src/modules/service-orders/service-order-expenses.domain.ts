import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { validateDispatchDocument, DispatchDocumentFile } from '../manufacturing/manufacturing-dispatch-files';

export const EXPENSE_CATEGORIES = {
  TRANSPORT: 'Transporte', MEALS: 'Alimentación', LODGING: 'Hospedaje',
  TOLLS: 'Peajes', PARKING: 'Parqueadero', MATERIALS: 'Materiales', OTHER: 'Otros',
} as const;
export const EXPENSE_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const EXPENSE_RECEIPT_MAX_COUNT = 10;
export const EXPENSE_RECEIPT_BATCH_BYTES = 30 * 1024 * 1024;

export function expenseBody(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Datos de gasto inválidos');
  const data = body as Record<string, unknown>;
  const allowed = ['expenseDate', 'category', 'description', 'amount', 'paidBy', 'version'];
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new BadRequestException('El gasto contiene campos no permitidos');
  if (typeof data.expenseDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.expenseDate)) throw new BadRequestException('Indica la fecha del gasto');
  const expenseDate = new Date(`${data.expenseDate}T00:00:00.000Z`);
  if (!Number.isFinite(expenseDate.getTime()) || expenseDate.toISOString().slice(0, 10) !== data.expenseDate) throw new BadRequestException('Fecha de gasto inválida');
  if (typeof data.category !== 'string' || !Object.prototype.hasOwnProperty.call(EXPENSE_CATEGORIES, data.category)) throw new BadRequestException('Categoría inválida');
  if (typeof data.description !== 'string' || !data.description.trim() || data.description.trim().length > 1000) throw new BadRequestException('El concepto debe tener entre 1 y 1000 caracteres');
  // Accept decimal strings so money never passes through binary arithmetic.
  if (typeof data.amount !== 'string' || !/^\d{1,12}(\.\d{1,2})?$/.test(data.amount)) throw new BadRequestException('Indica un valor positivo con máximo dos decimales');
  const amount = new Prisma.Decimal(data.amount);
  if (amount.lte(0)) throw new BadRequestException('El valor debe ser mayor que cero');
  if (data.paidBy !== 'EMPLOYEE' && data.paidBy !== 'COMPANY') throw new BadRequestException('Selecciona quién pagó el gasto');
  return {
    expenseDate, category: data.category as keyof typeof EXPENSE_CATEGORIES,
    description: data.description.trim(), amount, paidBy: data.paidBy as 'EMPLOYEE' | 'COMPANY',
  };
}

export function expenseVersion(body: unknown, onlyVersion = false): number {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Versión requerida');
  const data = body as Record<string, unknown>;
  if (onlyVersion && Object.keys(data).some(key => key !== 'version')) throw new BadRequestException('Campos no permitidos');
  if (!Number.isSafeInteger(data.version) || Number(data.version) < 1) throw new BadRequestException('Versión inválida');
  return Number(data.version);
}

export function expenseReceipt(file: DispatchDocumentFile) {
  if (!file?.buffer?.length) throw new BadRequestException('Selecciona un soporte no vacío');
  if (file.buffer.length > EXPENSE_RECEIPT_MAX_BYTES) throw new BadRequestException('Cada soporte debe pesar máximo 10 MB');
  if (!/\.(pdf|png|jpe?g|webp)$/i.test(file.originalname || '')) throw new BadRequestException('El soporte debe ser PDF, JPG, PNG o WebP');
  const metadata = validateDispatchDocument(file);
  return { ...metadata, storageKey: `${randomUUID()}${metadata.extension}` };
}

export function expenseReceiptPath(storageKey: string) {
  if (!/^[a-f0-9-]{36}\.(pdf|png|jpe?g|webp)$/.test(storageKey)) throw new BadRequestException('Identificador de soporte inválido');
  return path.join(process.env.ATTACHMENTS_DIR || path.resolve('./storage/attachments'), 'expense-receipts', storageKey);
}
