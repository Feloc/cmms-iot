import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { AttachmentsService } from '../attachments/attachments.service';
import type { MulterFile } from '../../common/types/multer-file';

// Reutilizamos el mismo directorio que el módulo de attachments
const STORAGE_DIR = process.env.ATTACHMENTS_DIR || path.resolve('./storage/attachments');
fs.mkdirSync(STORAGE_DIR, { recursive: true });

/**
 * Controlador de COMPATIBILIDAD para el panel actual de Work Orders.
 * Rutas expuestas:
 *   GET  /work-orders/:workOrderId/attachments
 *   POST /work-orders/:workOrderId/attachments (multipart)
 *
 * Internamente delega en AttachmentsService (entidad = 'work_order').
 */
@Controller('work-orders/:workOrderId/attachments')
export class WorkOrderAttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  async list(
    @Param('workOrderId') workOrderId: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    if (!workOrderId) throw new BadRequestException('workOrderId is required');
    const p = page ? Number(page) : 1;
    const s = size ? Number(size) : 50;
    return this.attachments.findAll({ workOrderId, page: p, size: s });
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
    @Param('workOrderId') workOrderId: string,
    @UploadedFile() file?: MulterFile,
  ) {
    if (!workOrderId) throw new BadRequestException('workOrderId is required');
    if (!file) throw new BadRequestException('file is required');

    // El panel actual de WO usualmente no envía "type"; por defecto usamos DOCUMENT si mimetype no es imagen/video/audio
    const type = mimeToAttachmentType(file.mimetype);

    const saved = await this.attachments.create({
      entity: 'work_order',
      entityId: workOrderId,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      diskPath: file.path,
      type,
    });

    return saved; // contiene url (ruta local) según AttachmentsService
  }
}

function mimeToAttachmentType(mime?: string): 'IMAGE'|'VIDEO'|'AUDIO'|'DOCUMENT' {
  if (!mime) return 'DOCUMENT';
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  return 'DOCUMENT';
}
