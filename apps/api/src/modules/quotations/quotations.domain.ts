import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';

export const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
export const TERMINAL = ['CLOSED', 'REJECTED', 'CANCELED'];
export function required(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new BadRequestException(`${label} es obligatorio`);
  return value.trim();
}
export function quantity(value: string) {
  const result = D(value);
  if (!result.isFinite() || result.lte(0)) throw new BadRequestException('La cantidad debe ser mayor que cero');
  return result;
}
export function amount(lines: { quantity: Prisma.Decimal.Value; unitPrice: Prisma.Decimal.Value; taxPct: Prisma.Decimal.Value }[]) {
  return lines.reduce((sum, l) => sum.add(D(l.quantity).mul(l.unitPrice).mul(D(1).add(D(l.taxPct).div(100))).toDecimalPlaces(2)), D(0)).toFixed(2);
}
export function remaining(limit: Prisma.Decimal.Value, used: Prisma.Decimal.Value, qty: Prisma.Decimal.Value, label: string) {
  if (D(qty).lte(0) || D(used).add(qty).gt(limit)) throw new ConflictException(`${label}: la cantidad excede el saldo pendiente`);
}
export function documentFile(file?: { buffer: Buffer; originalname: string; size: number }) {
  if (!file || !file.buffer.length || file.buffer.length > 10 * 1024 * 1024) throw new BadRequestException('Adjunta un archivo de hasta 10 MB');
  const bytes = file.buffer, ext = extname(file.originalname).toLowerCase();
  let mimeType = '';
  if (ext === '.pdf' && bytes.subarray(0, 5).toString() === '%PDF-') mimeType = 'application/pdf';
  if (['.jpg', '.jpeg'].includes(ext) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mimeType = 'image/jpeg';
  if (ext === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mimeType = 'image/png';
  if (ext === '.webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') mimeType = 'image/webp';
  if (!mimeType) throw new BadRequestException('Formatos admitidos: PDF, JPG, PNG y WebP con contenido válido');
  return { filename: file.originalname.replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 200), mimeType, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
export function progress(lines: any[]) {
  const accepted = lines.filter(l => D(l.approvedQty).gt(0));
  return {
    procurement: accepted.filter(l => l.kind === 'PART' && l.route !== 'STOCK' && D(l.orderedQty).lt(l.approvedQty)).length,
    reception: accepted.filter(l => l.kind === 'PART' && D(l.receivedQty).lt(l.approvedQty)).length,
    service: accepted.filter(l => l.kind === 'SERVICE' && D(l.executedQty).lt(l.approvedQty)).length,
    invoice: accepted.filter(l => D(l.invoicedQty).lt(l.approvedQty)).length,
    delivery: accepted.filter(l => l.kind === 'PART' && D(l.deliveredQty).lt(l.approvedQty)).length,
    complete: accepted.length > 0 && accepted.every(l => D(l.invoicedQty).eq(l.approvedQty) && (l.kind === 'SERVICE' ? D(l.executedQty).eq(l.approvedQty) : D(l.deliveredQty).eq(l.approvedQty))),
  };
}
