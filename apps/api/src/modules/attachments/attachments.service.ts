import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { createStorage } from '../../common/storage/storage.factory';
import { AttachmentsRepository } from './attachments.repository';
import { AttachmentTypeDto } from './dto/create-attachment.dto';

@Injectable()
export class AttachmentsService {
  private storage = createStorage();

  constructor(private readonly repo: AttachmentsRepository) {}

  async uploadMultipart(params: {
    tenantId: string;
    workOrderId: string;
    userId: string;
    file: Express.Multer.File;
    type: AttachmentTypeDto;
  }) {
    if (!params.file) throw new BadRequestException('Archivo requerido');
    const maxMb = parseInt(process.env.ATTACHMENTS_MAX_SIZE_MB || '20', 10);
    if (params.file.size > maxMb * 1024 * 1024) {
      throw new BadRequestException(`Archivo excede el máximo de ${maxMb} MB`);
    }

    const safeName = params.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `tenants/${params.tenantId}/work-orders/${params.workOrderId}/attachments/${Date.now()}_${safeName}`;

    const saved = await this.storage.save({
      key,
      buffer: params.file.buffer,
      mimeType: params.file.mimetype,
    });

    const created = await this.repo.create({
      tenantId: params.tenantId,
      workOrderId: params.workOrderId,
      type: params.type,
      filename: params.file.originalname,
      mimeType: params.file.mimetype,
      size: saved.size,
      storageKey: saved.storageKey,
      url: saved.publicUrl,
      createdBy: params.userId,
    });

    return created;
  }

  async list(tenantId: string, workOrderId: string) {
    return this.repo.listByWorkOrder(tenantId, workOrderId);
  }

  async remove(tenantId: string, id: string) {
    const att = await this.repo.findById(tenantId, id);
    if (!att) throw new NotFoundException('Adjunto no encontrado');
    await this.storage.remove({ key: att.storageKey });
    await this.repo.delete(tenantId, id);
    return { deleted: true };
  }
}
