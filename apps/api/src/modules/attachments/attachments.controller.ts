import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Res,
  Body,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { AttachmentsService } from './attachments.service';

const STORAGE_DIR = process.env.ATTACHMENTS_DIR || path.resolve('./storage/attachments');
fs.mkdirSync(STORAGE_DIR, { recursive: true });

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly svc: AttachmentsService) {}

  @Get()
  async findAll(
    @Query('entityType') entityType?: 'asset' | 'work_order',
    @Query('entityId') entityId?: string,
    @Query('workOrderId') workOrderId?: string,
    @Query('assetId') assetId?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const p = page ? Number(page) : 1;
    const s = size ? Number(size) : 100;
    return this.svc.findAll({ entityType, entityId, workOrderId, assetId, page: p, size: s });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) { return this.svc.findOne(id); }

  /**
   * INLINE VIEW → permite visualizar en el navegador (pdf/imágenes/video/audio).
   * Usar en <img src>, <video src>, <audio src> y botón "Ver".
   */
  @Get(':id/view')
  async view(@Param('id') id: string, @Res() res: Response) {
    const file = await this.svc.getFileInfo(id);
    if (!file.path || !fs.existsSync(file.path)) throw new BadRequestException('file not found');
    const stat = fs.statSync(file.path);
    res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(file.size ?? stat.size));
    // inline → el navegador trata de mostrarlo si puede (PDF, image, etc.)
    res.setHeader('Content-Disposition', `inline; filename="${encodeRFC5987ValueChars(file.filename)}"`);
    fs.createReadStream(file.path).pipe(res);
  }

  /**
   * DOWNLOAD → fuerza descarga (attachment)
   */
  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const file = await this.svc.getFileInfo(id);
    if (!file.path || !fs.existsSync(file.path)) throw new BadRequestException('file not found');
    const stat = fs.statSync(file.path);
    res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(file.size ?? stat.size));
    res.setHeader('Content-Disposition', `attachment; filename="${encodeRFC5987ValueChars(file.filename)}"`);
    fs.createReadStream(file.path).pipe(res);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, STORAGE_DIR),
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname) || '';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: (Number(process.env.ATTACHMENTS_MAX_MB || 30)) * 1024 * 1024 },
    })
  )
  async upload(
    @UploadedFile() file?: Express.Multer.File,
    @Body('entityType') entityType?: 'asset' | 'work_order',
    @Body('entityId') entityId?: string,
    @Body('workOrderId') workOrderId?: string,
    @Body('assetId') assetId?: string,
    @Body('type') type?: 'IMAGE'|'VIDEO'|'AUDIO'|'DOCUMENT',
    @Body('kind') kind?: 'image'|'video'|'audio'|'doc'|'other',
  ) {
    if (!file) throw new BadRequestException('file is required');
    let resolved: { entity: 'asset' | 'work_order'; id: string } | null = null;
    if (entityType && entityId) resolved = { entity: entityType, id: entityId };
    else if (workOrderId) resolved = { entity: 'work_order', id: workOrderId };
    else if (assetId) resolved = { entity: 'asset', id: assetId };
    if (!resolved) throw new BadRequestException('entityType+entityId (o workOrderId/assetId) son requeridos');

    const saved = await this.svc.create({
      entity: resolved.entity,
      entityId: resolved.id,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      diskPath: file.path,
      type: (type || mapKindToType(kind)) as any,
    });
    return saved;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) { return this.svc.remove(id); }
}

function mapKindToType(kind?: 'image'|'video'|'audio'|'doc'|'other'):
  'IMAGE'|'VIDEO'|'AUDIO'|'DOCUMENT'|undefined {
  switch (kind) {
    case 'image': return 'IMAGE';
    case 'video': return 'VIDEO';
    case 'audio': return 'AUDIO';
    case 'doc': return 'DOCUMENT';
    default: return undefined;
  }
}

// Escapar filename para Content-Disposition (RFC 5987)
function encodeRFC5987ValueChars(str: string) {
  return encodeURIComponent(str)
    .replace(/['()]/g, escape) // i.e., %27 %28 %29
    .replace(/\*/g, '%2A')
    .replace(/%(?:7C|60|5E)/g, unescape);
}