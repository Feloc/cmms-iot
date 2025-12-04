import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateDeviceDto, DeviceStatusDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { createId } from '@paralleldrive/cuid2';

@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}

  private ensureIngestKey(key?: string) {
    return key && key.trim().length >= 8 ? key.trim() : `ing_${createId()}`;
  }

  async list(tenantId: string, page = 1, size = 20, q?: string) {
    const where: any = { tenantId };
    if (q && q.trim()) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { model: { contains: q, mode: 'insensitive' } },
        { manufacturer: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.device.count({ where }),
      this.prisma.device.findMany({
        where,
        take: size,
        skip: (page - 1) * size,
        orderBy: { createdAt: 'desc' },
        include: { asset: { select: { id: true, name: true, code: true } } },
      }),
    ]);
    return { page, size, total, pages: Math.max(1, Math.ceil(total / Math.max(1, size))), items };
  }

  async byId(tenantId: string, id: string) {
    const dev = await this.prisma.device.findFirst({ where: { id, tenantId }, include: { asset: true } });
    if (!dev) throw new NotFoundException('Device not found');
    return dev;
  }

  async create(tenantId: string, dto: CreateDeviceDto) {
    // code es UNIQUE global. Si quieres que sea único por tenant, cámbialo en Prisma a @@unique([tenantId, code])
    const ingestKey = this.ensureIngestKey(dto.ingestKey);
    try {
      const created = await this.prisma.device.create({
        data: {
          tenantId,
          assetId: dto.assetId ?? null,
          name: dto.name,
          code: dto.code,
          model: dto.model ?? null,
          manufacturer: dto.manufacturer ?? null,
          description: dto.description ?? null,
          ingestKey,
          status: (dto.status as any) ?? 'ACTIVE',
        },
      });
      return created;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new BadRequestException('code o ingestKey ya existe');
      }
      throw e;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateDeviceDto) {
    const exists = await this.prisma.device.findFirst({ where: { id, tenantId } });
    if (!exists) throw new NotFoundException('Device not found');

    const data: any = {
      name: dto.name ?? undefined,
      code: dto.code ?? undefined,
      model: dto.model ?? undefined,
      manufacturer: dto.manufacturer ?? undefined,
      description: dto.description ?? undefined,
      status: (dto.status as any) ?? undefined,
      assetId: dto.assetId === null ? null : dto.assetId ?? undefined,
    };
    if (dto.ingestKey) data.ingestKey = this.ensureIngestKey(dto.ingestKey);

    try {
      return await this.prisma.device.update({ where: { id }, data });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('code o ingestKey ya existe');
      throw e;
    }
  }

  async remove(tenantId: string, id: string) {
    // Hard delete; si prefieres soft delete, agrega un campo deletedAt
    const exists = await this.prisma.device.findFirst({ where: { id, tenantId } });
    if (!exists) throw new NotFoundException('Device not found');
    await this.prisma.device.delete({ where: { id } });
    return { ok: true };
  }

  async listByAsset(tenantId: string, assetId: string) {
    return this.prisma.device.findMany({ where: { tenantId, assetId }, orderBy: { createdAt: 'desc' } });
  }

  async ping(tenantId: string, id: string) {
    const exists = await this.prisma.device.findFirst({ where: { id, tenantId } });
    if (!exists) throw new NotFoundException('Device not found');
    return this.prisma.device.update({ where: { id }, data: { lastSeenAt: new Date(), status: 'ACTIVE' as any } });
  }
}