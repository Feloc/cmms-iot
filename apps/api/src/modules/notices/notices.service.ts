import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { CreateNoticeDto, UpdateNoticeDto } from './dto/notice.dto';
import { NoticeStatus, NoticeSource } from '@prisma/client';

@Injectable()
export class NoticesService {
  constructor(private prisma: PrismaService) {}

  private getContext() {
    const { tenantId, userId } = tenantStorage.getStore() || {};
    if (!tenantId) throw new Error('No tenant in context');
    return {tenantId, userId};
  }

  async findAll(params: { q?: string; status?: string; assetCode?: string; limit?: number; cursor?: string } = {}) {
    const { tenantId } = this.getContext();
    const { q, status, assetCode, limit = 20, cursor } = params;

    const items = await this.prisma.notice.findMany({
      where: {
        tenantId,
        ...(status ? { status: status as any } : {}),
        ...(assetCode ? { assetCode } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { body: { contains: q, mode: 'insensitive' } },
                { tags: { hasSome: q.split(/\s+/).filter(Boolean) } },
              ],
            }
          : {}),
      },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return {
      items,
      nextCursor: items.length === limit ? items[items.length - 1].id : undefined,
    };
  }

  async findOne(id: string) {
    const { tenantId } = this.getContext();
    return this.prisma.notice.findFirstOrThrow({
      where: { id, tenantId },
      include: { alert: true },
    });
  }

  async create(dto: CreateNoticeDto) {
    const { tenantId, userId } = this.getContext();
    if (!userId) throw new Error('No user in context');

    const toDate = (s?: string) => (s ? new Date(s) : undefined);

    return this.prisma.notice.create({
      data: {
        tenantId,
        createdByUserId: userId,
        source: (dto.source ?? NoticeSource.MANUAL) as NoticeSource,
        alertId: dto.alertId,

        assetCode: dto.assetCode,
        title: dto.title,
        body: dto.body,
        category: dto.category as any,
        severity: dto.severity as any,
        status: (dto.status ?? NoticeStatus.OPEN) as NoticeStatus ,

        assignedToUserId: dto.assignedToUserId,
        dueDate: toDate(dto.dueDate),
        startedAt: toDate(dto.startedAt),
        resolvedAt: toDate(dto.resolvedAt),
        downtimeMin: dto.downtimeMin,

        tags: dto.tags ?? [],
        attachments: dto.attachments,
      },
    });
  }

  async update(id: string, dto: UpdateNoticeDto) {
    const { tenantId } = this.getContext();
    const toDate = (s?: string) => (s ? new Date(s) : undefined);

    // asegura pertenencia
    await this.prisma.notice.findFirstOrThrow({ where: { id, tenantId } });
    return this.prisma.notice.update({
      where: { id },
      data: {

        ...(dto.source ? { source: dto.source } : {}),
        ...(dto.alertId !== undefined ? { alertId: dto.alertId } : {}),

        ...(dto.assetCode ? { assetCode: dto.assetCode } : {}),
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
        ...(dto.status ? { status: dto.status } : {}),

        ...(dto.assignedToUserId !== undefined
          ? { assignedToUserId: dto.assignedToUserId }
          : {}),

        ...(dto.dueDate !== undefined ? { dueDate: toDate(dto.dueDate) } : {}),
        ...(dto.startedAt !== undefined ? { startedAt: toDate(dto.startedAt) } : {}),
        ...(dto.resolvedAt !== undefined ? { resolvedAt: toDate(dto.resolvedAt) } : {}),
        ...(dto.downtimeMin !== undefined ? { downtimeMin: dto.downtimeMin } : {}),

        ...(dto.tags ? { tags: dto.tags } : {}), // reemplaza array completo
        ...(dto.attachments !== undefined ? { attachments: dto.attachments } : {}),
      },
    });
  }

  async remove(id: string) {
    const { tenantId } = this.getContext();
    // asegurar tenant
    await this.prisma.notice.findFirstOrThrow({ where: { id, tenantId } });
    await this.prisma.notice.delete({ where: { id } });
    return { ok: true };
  }

  async createWorkOrderFromNotice(
    noticeId: string,
    body: { title?: string; description?: string; priority?: 'LOW'|'MEDIUM'|'HIGH'|'URGENT'; dueDate?: string}
  ) {
    const {tenantId} = this.getContext();

    const notice = await this.prisma.notice.findFirst({
      where: { id: noticeId, tenantId },
    });
    if (!notice) throw new Error('Notice not found');

    const wo = await this.prisma.workOrder.create({
      data: {
        tenantId,
        noticeId: notice.id,
        assetCode: notice.assetCode,
        title: body.title ?? notice.title,
        description: body.description ?? notice.body ?? undefined,
        priority: body.priority as any,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      },
    });

    // Opcional: mover Notice a IN_PROGRESS si aún está OPEN
    if (notice.status === NoticeStatus.OPEN) {
      await this.prisma.notice.update({
        where: { id: notice.id },
        data: { status: NoticeStatus.IN_PROGRESS },
      });
    }

    return wo;
  }
}
