import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';

export type FindAllQuery = {
  entityType?: 'asset' | 'work_order';
  entityId?: string;
  workOrderId?: string;
  assetId?: string;
  page?: number; size?: number;
};

export type CreateAttachmentInput = {
  entity: 'asset' | 'work_order';
  entityId: string;
  filename: string;
  mimeType?: string | null;
  size?: number | null;
  diskPath: string; // ruta física donde multer guardó el archivo
  type?: 'IMAGE'|'VIDEO'|'AUDIO'|'DOCUMENT';
};

@Injectable()
export class AttachmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private getTenantId(): string {
    const ctx = tenantStorage.getStore();
    const tenantId = ctx?.tenantId;
    if (!tenantId) throw new BadRequestException('No tenant in context');
    return tenantId;
  }

  async findAll(q: FindAllQuery) {
    const tenantId = this.getTenantId();
    const page = Math.max(1, Number(q.page || 1));
    const size = Math.min(200, Math.max(1, Number(q.size || 100)));
    const skip = (page - 1) * size;

    // Resolver filtro según tu modelo actual (scalar FKs workOrderId/assetId)
    const where: any = { tenantId };
    if (q.entityType && q.entityId) {
      if (q.entityType === 'work_order') where.workOrderId = q.entityId;
      if (q.entityType === 'asset') where.assetId = q.entityId;
    } else if (q.workOrderId) {
      where.workOrderId = q.workOrderId;
    } else if (q.assetId) {
      where.assetId = q.assetId;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.attachment.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: size }),
      this.prisma.attachment.count({ where }),
    ]);

    // En tu modelo "url" ya guarda la ruta o URL usable para descarga
    return { items, page, size, total, pages: Math.ceil(total / size) };
  }

  async findOne(id: string) {
    const tenantId = this.getTenantId();
    const item = await this.prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException('Attachment not found');
    return item;
  }

  async getFileInfo(id: string) {
    const item = await this.findOne(id);
    // En tu implementación actual, "url" contiene el path físico (p.ej. /app/storage/attachments/uuid.ext)
    const path = item.url;
    console.log('path', path);
    
    return { path, filename: item.filename, size: item.size, contentType: item.mimeType };
  }

  async create(input: CreateAttachmentInput) {
    const tenantId = this.getTenantId();

    const data: any = {
      tenantId,
      type: input.type || 'DOCUMENT',
      filename: input.filename,
      mimeType: input.mimeType || null,
      size: input.size || null,
      url: input.diskPath, // guardamos la ruta física en url (compatible con tu modelo existente)
      createdBy: tenantStorage.getStore()?.userId || 'system',
    };

    // IMPORTANTE: usar campos escalares FK, no nested connect (tu modelo puede no tener relación Prisma "asset")
    if (input.entity === 'work_order') data.workOrderId = input.entityId;
    if (input.entity === 'asset') data.assetId = input.entityId;

    const saved = await this.prisma.attachment.create({ data });
    return saved;
  }

  async remove(id: string) {
    const tenantId = this.getTenantId();
    const item = await this.prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException('Attachment not found');

    await this.prisma.attachment.delete({ where: { id } });

    // Borrado físico best-effort
    try {
      const fs = await import('fs');
      if (item.url && fs.existsSync(item.url)) fs.unlinkSync(item.url);
    } catch {}

    return { ok: true };
  }
}
