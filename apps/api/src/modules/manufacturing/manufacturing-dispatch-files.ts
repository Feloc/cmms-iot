import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { inflateRawSync } from 'zlib';

export const DISPATCH_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const DISPATCH_CHECKLIST_MAX_FILES = 10;
export const DISPATCH_CHECKLIST_BATCH_MAX_BYTES = 50 * 1024 * 1024;
export type DispatchDocumentFile = { originalname: string; mimetype: string; buffer: Buffer };
export type DispatchDocumentMetadata = { storageKey: string; filename: string; mimeType: string; size: number };

const formats: Record<string, { mimeType: string; aliases?: string[] }> = {
  '.pdf': { mimeType: 'application/pdf' },
  '.doc': { mimeType: 'application/msword' },
  '.docx': { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  '.xls': { mimeType: 'application/vnd.ms-excel' },
  '.xlsx': { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  '.csv': { mimeType: 'text/csv', aliases: ['application/csv', 'application/vnd.ms-excel', 'text/plain'] },
  '.txt': { mimeType: 'text/plain' },
  '.png': { mimeType: 'image/png' },
  '.jpg': { mimeType: 'image/jpeg', aliases: ['image/jpg', 'image/pjpeg', 'image/x-jpeg'] },
  '.jpeg': { mimeType: 'image/jpeg', aliases: ['image/jpg', 'image/pjpeg', 'image/x-jpeg'] },
  '.webp': { mimeType: 'image/webp' },
};
const invalidFormat = () => new BadRequestException('Formato no válido. Usa PDF, Word, Excel, CSV, TXT, JPG, PNG o WebP con extensión, contenido y tipo coincidentes');

// Follow JPEG markers so thumbnail metadata cannot stand in for the main image's end marker.
// Exporters may append padding or metadata after EOI; those bytes are not image corruption.
function jpegImage(bytes: Buffer) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let offset = 2; let inScan = false; let hasScan = false; let scanHasData = false; let height = 0;
  let components: Set<number> | undefined;
  while (offset < bytes.length) {
    const fromScan = inScan;
    if (inScan) {
      const next = bytes.indexOf(0xff, offset);
      if (next < 0) return false;
      if (next > offset) scanHasData = true;
      offset = next;
    }
    if (bytes[offset++] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) return false;
    const marker = bytes[offset++];
    if (fromScan && marker === 0x00) { scanHasData = true; continue; }
    if (fromScan && marker >= 0xd0 && marker <= 0xd7) continue;
    if (marker === 0x01) continue; // TEM is a standalone marker, including inside arithmetic scans.
    if (marker === 0xd9) return !!components && height > 0 && hasScan && scanHasData;
    if (marker === 0xd8 || marker < 0xc0 || (marker >= 0xd0 && marker <= 0xd7)) return false;
    if (fromScan && marker !== 0xdc && !scanHasData) return false;
    inScan = false;
    if (offset + 2 > bytes.length) return false;
    const length = bytes.readUInt16BE(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) return false;
    const payload = offset + 2;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 11) return false;
      const count = bytes[payload + 5];
      if (!count || length !== 8 + 3 * count || !bytes[payload] || bytes[payload] > 16 || !bytes.readUInt16BE(payload + 3)) return false;
      height = bytes.readUInt16BE(payload + 1);
      components = new Set<number>();
      for (let index = 0; index < count; index++) components.add(bytes[payload + 6 + 3 * index]);
      if (components.size !== count) return false;
    } else if (marker === 0xda) {
      if (!components || length < 8) return false;
      const count = bytes[payload];
      if (!count || count > components.size || length !== 6 + 2 * count) return false;
      const scanComponents = new Set<number>();
      for (let index = 0; index < count; index++) {
        const component = bytes[payload + 1 + 2 * index];
        if (!components.has(component)) return false;
        scanComponents.add(component);
      }
      if (scanComponents.size !== count) return false;
      inScan = true; hasScan = true; scanHasData = false;
    } else if (marker === 0xdc) {
      if (!fromScan || length !== 4 || !components || height || !bytes.readUInt16BE(payload)) return false;
      height = bytes.readUInt16BE(payload); inScan = true;
    }
    offset = end;
  }
  return false;
}

// Inspect the central directory rather than trusting a PK prefix or inflating an entire Office archive.
function officeArchive(buffer: Buffer, extension: string) {
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) { end = offset; break; }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0) return false;
  const count = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const directoryStart = buffer.readUInt32LE(end + 16);
  if (!count || count > 10000 || buffer.readUInt16LE(end + 8) !== count || directoryStart + directorySize !== end) return false;
  const entries = new Map<string, { offset: number; compressed: number; size: number; method: number }>();
  let cursor = directoryStart; let expandedSize = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) return false;
    const flags = buffer.readUInt16LE(cursor + 8); const method = buffer.readUInt16LE(cursor + 10);
    const compressed = buffer.readUInt32LE(cursor + 20); const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28); const extraLength = buffer.readUInt16LE(cursor + 30); const commentLength = buffer.readUInt16LE(cursor + 32);
    const offset = buffer.readUInt32LE(cursor + 42); const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 1 || ![0, 8].includes(method) || buffer.readUInt16LE(cursor + 34) !== 0 || offset + 30 > directoryStart) return false;
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    if (!name || entries.has(name) || /(^\/|\\|\x00|(^|\/)\.\.(\/|$)|vbaProject\.bin$)/i.test(name)) return false;
    if (buffer.readUInt32LE(offset) !== 0x04034b50 || buffer.readUInt16LE(offset + 8) !== method || buffer.readUInt16LE(offset + 6) & 1) return false;
    const localNameLength = buffer.readUInt16LE(offset + 26); const localExtraLength = buffer.readUInt16LE(offset + 28);
    const dataOffset = offset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressed > directoryStart || buffer.toString('utf8', offset + 30, offset + 30 + localNameLength) !== name) return false;
    expandedSize += size;
    if (expandedSize > 200 * 1024 * 1024) return false;
    entries.set(name, { offset: dataOffset, compressed, size, method }); cursor = next;
  }
  if (cursor !== end || !entries.has('_rels/.rels')) return false;
  const main = extension === '.docx' ? 'word/document.xml' : 'xl/workbook.xml';
  const xml = (name: string, limit: number) => {
    const entry = entries.get(name);
    if (!entry || !entry.size || entry.size > limit) return '';
    const compressed = buffer.subarray(entry.offset, entry.offset + entry.compressed);
    const data = entry.method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: limit });
    if (data.length !== entry.size) return '';
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  };
  const contentTypes = xml('[Content_Types].xml', 1024 * 1024); const document = xml(main, DISPATCH_DOCUMENT_MAX_BYTES);
  const expectedType = extension === '.docx' ? 'wordprocessingml.document.main+xml' : 'spreadsheetml.sheet.main+xml';
  return contentTypes.includes(expectedType) && (extension === '.docx' ? /<(?:[\w.-]+:)?document[\s>]/.test(document) : /<(?:[\w.-]+:)?workbook[\s>]/.test(document));
}

export function validateDispatchDocument(file?: DispatchDocumentFile): Omit<DispatchDocumentMetadata, 'storageKey'> & { extension: string } {
  if (!file?.buffer?.length) throw new BadRequestException('Selecciona un documento no vacío');
  if (file.buffer.length > DISPATCH_DOCUMENT_MAX_BYTES) throw new BadRequestException('El archivo supera 20 MB');
  const original = String(file.originalname || '').replace(/\\/g, '/').split('/').pop()!.replace(/[\x00-\x1f\x7f]/g, '').trim();
  const extension = path.extname(original).toLowerCase();
  const format = Object.prototype.hasOwnProperty.call(formats, extension) ? formats[extension] : undefined;
  const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
  if (!format || (mime && mime !== 'application/octet-stream' && ![format.mimeType, ...(format.aliases || [])].includes(mime))) throw invalidFormat();
  const bytes = file.buffer;
  let valid = false;
  try {
    if (extension === '.pdf') valid = /^%PDF-\d\.\d/.test(bytes.toString('ascii', 0, 8)) && bytes.subarray(Math.max(0, bytes.length - 1024)).includes(Buffer.from('%%EOF'));
    else if (extension === '.docx' || extension === '.xlsx') valid = officeArchive(bytes, extension);
    else if (extension === '.doc' || extension === '.xls') valid = bytes.length >= 512 && bytes.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1';
    else if (extension === '.txt' || extension === '.csv') {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      valid = !!text.trim() && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) && !/^\s*(?:#!|<\?xml|@echo\s+off\b)/i.test(text)
        && !/<\s*(?:!doctype\s+html|html|head|body|script|iframe|svg|object|embed|style|meta|div|span|table|img|link|a|p)(?:\s|\/?>)/i.test(text);
    } else if (extension === '.png') valid = bytes.length >= 33 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.subarray(-12, -8).toString('hex') === '00000000' && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND';
    else if (extension === '.jpg' || extension === '.jpeg') valid = jpegImage(bytes);
    else if (extension === '.webp') valid = bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16));
  } catch { valid = false; }
  if (!valid) throw invalidFormat();
  const stem = path.parse(original).name.replace(/[<>:"|?*]/g, '_').replace(/^\.+/, '').trim().slice(0, 200 - extension.length) || 'documento';
  return { filename: `${stem}${extension}`, mimeType: format.mimeType, extension, size: bytes.length };
}

export function dispatchDocumentPath(key: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(pdf|docx?|xlsx?|csv|txt|png|jpe?g|webp)$/.test(key)) throw new BadRequestException('Identificador de archivo inválido');
  return path.join(process.env.ATTACHMENTS_DIR || path.resolve('./storage/attachments'), 'dispatch-documents', key);
}

export async function storeDispatchDocument(file: DispatchDocumentFile): Promise<DispatchDocumentMetadata> {
  const { extension, ...metadata } = validateDispatchDocument(file);
  const storageKey = `${randomUUID()}${extension}`;
  const target = dispatchDocumentPath(storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  try { await fs.writeFile(target, file.buffer, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') await fs.unlink(target).catch(() => undefined); throw error; }
  return { ...metadata, storageKey };
}
