import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

export const FAT_MEDIA_MAX_BYTES = 50 * 1024 * 1024;
export type FatMediaFile = { originalname: string; mimetype: string; buffer: Buffer };
export type FatMediaMetadata = { storageKey: string; filename: string; mimeType: string; size: number };

export function validateFatMedia(file?: FatMediaFile) {
  if (!file?.buffer?.length) throw new BadRequestException('Selecciona una imagen o un video no vacío');
  const b = file.buffer;
  let mimeType = ''; let extension = '';
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && b.toString('ascii', 12, 16) === 'IHDR') { mimeType = 'image/png'; extension = '.png'; }
  else if (b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255) { mimeType = 'image/jpeg'; extension = '.jpg'; }
  else if (b.length >= 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') { mimeType = 'image/webp'; extension = '.webp'; }
  else if (b.length >= 16 && b.toString('ascii', 4, 8) === 'ftyp') {
    const brand = b.toString('ascii', 8, 12);
    if (brand === 'qt  ') { mimeType = 'video/quicktime'; extension = '.mov'; }
    else if (['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V '].includes(brand)) { mimeType = 'video/mp4'; extension = '.mp4'; }
  } else if (b.length >= 16 && b.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')) && b.subarray(0, 4096).includes(Buffer.from('webm'))) { mimeType = 'video/webm'; extension = '.webm'; }
  if (!mimeType || file.mimetype !== mimeType) throw new BadRequestException('Formato no válido. Usa JPG, PNG, WebP, MP4, WebM o MOV con contenido y tipo coincidentes');
  const limit = mimeType.startsWith('image/') ? 10 * 1024 * 1024 : FAT_MEDIA_MAX_BYTES;
  if (b.length > limit) throw new BadRequestException(`El archivo supera ${limit / 1024 / 1024} MB`);
  let filename = file.originalname.replace(/\\/g, '/').split('/').pop()!.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200) || `evidencia${extension}`;
  // Download names must remain media filenames, even when the submitted name is misleading.
  if (path.extname(filename).toLowerCase() !== extension && !(extension === '.jpg' && path.extname(filename).toLowerCase() === '.jpeg')) filename = `${path.parse(filename).name || 'evidencia'}${extension}`;
  return { mimeType, extension, filename, size: b.length };
}

export function fatMediaPath(key: string) {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp|mp4|webm|mov)$/.test(key)) throw new BadRequestException('Identificador de archivo inválido');
  return path.join(process.env.ATTACHMENTS_DIR || path.resolve('./storage/attachments'), 'fat', key);
}

export async function storeFatMedia(file: FatMediaFile): Promise<FatMediaMetadata> {
  const { extension, ...metadata } = validateFatMedia(file);
  const storageKey = `${randomUUID()}${extension}`;
  const target = fatMediaPath(storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  try { await fs.writeFile(target, file.buffer, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') await fs.unlink(target).catch(() => undefined); throw error; }
  return { ...metadata, storageKey };
}
