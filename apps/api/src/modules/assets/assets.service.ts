import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, AssetStatus, AssetCriticality } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';


type FindAllQuery = {
  search?: string;
  status?: AssetStatus | '';
  locationId?: string;
  categoryId?: string;
  page?: number; // 1-based
  size?: number; // page size
  orderBy?: 'createdAt:desc' | 'createdAt:asc' | 'name:asc' | 'name:desc';
};

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  private getTenantId(): string {
    const ctx = tenantStorage.getStore();
    const tenantId = ctx?.tenantId;
    if (!tenantId) throw new BadRequestException('No tenant in context');
    return tenantId;
  }

  private async withTenantRLS<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const tenantId = this.getTenantId();
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  async findAll(q: FindAllQuery = {}) {
    const tenantId = this.getTenantId();
    const page = Math.max(1, Number(q.page || 1));
    const size = Math.min(100, Math.max(1, Number(q.size || 20)));
    const skip = (page - 1) * size;

    const where: Prisma.AssetWhereInput = { tenantId };

    if (q.search) {
      const s = q.search.trim();
      where.OR = [
        { code: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
        { brand: { contains: s, mode: 'insensitive' } },
        { model: { contains: s, mode: 'insensitive' } },
        { serialNumber: { contains: s, mode: 'insensitive' } },
        { customer: { contains: s, mode: 'insensitive' } },
      ];
    }

    if (q.status) where.status = q.status as AssetStatus;
    if (q.locationId) where.locationId = q.locationId;
    if (q.categoryId) where.categoryId = q.categoryId;

    const orderBy: Prisma.AssetOrderByWithRelationInput[] = [];
    switch (q.orderBy) {
      case 'createdAt:asc':
        orderBy.push({ createdAt: 'asc' });
        break;
      case 'name:desc':
        orderBy.push({ name: 'desc' });
        break;
      case 'name:asc':
        orderBy.push({ name: 'asc' });
        break;
      default:
        orderBy.push({ createdAt: 'desc' });
    }

    return this.withTenantRLS(async (tx) => {
      const [items, total] = await Promise.all([
        tx.asset.findMany({ where, orderBy, skip, take: size }),
        tx.asset.count({ where }),
      ]);
      return { items, page, size, total, pages: Math.ceil(total / size) };
    });
  }

  async findOne(id: string) {
    if (!id) throw new BadRequestException('id is required');
    return this.withTenantRLS(async (tx) => {
      const asset = await tx.asset.findFirst({ where: { id } });
      if (!asset) throw new NotFoundException('Asset not found');
      return asset;
    });
  }

  async create(dto: CreateAssetDto) {
    const tenantId = this.getTenantId();

    const data: Prisma.AssetCreateInput = {
      tenant: { connect: { id: tenantId } },
      code: dto.code?.trim(),
      name: dto.name?.trim(),
      customer: (dto as any).customer ?? undefined,
      brand: dto.brand ?? null,
      model: dto.model ?? null,
      serialNumber: dto.serialNumber ?? null,
      nominalPower: dto.nominalPower ?? null,
      nominalPowerUnit: dto.nominalPowerUnit ?? null,
      status: (dto.status as AssetStatus) ?? AssetStatus.ACTIVE,
      criticality: (dto.criticality as AssetCriticality) ?? AssetCriticality.MEDIUM,
      acquiredOn: dto.acquiredOn ? new Date(dto.acquiredOn as any) : null,
      ingestKey: dto.ingestKey ?? null,
      assetTopicPrefix: dto.assetTopicPrefix ?? null,
    } as any;

    try {
      return await this.withTenantRLS(async (tx) => tx.asset.create({ data }));
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('Asset code already exists for this tenant');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateAssetDto) {
    if (!id) throw new BadRequestException('id is required');

    const data: Prisma.AssetUpdateInput = {
      code: dto.code?.trim(),
      name: dto.name?.trim(),
      customer: (dto as any).customer ?? undefined,
      brand: dto.brand,
      model: dto.model,
      serialNumber: dto.serialNumber,
      nominalPower: dto.nominalPower,
      nominalPowerUnit: dto.nominalPowerUnit,
      status: dto.status as any,
      criticality: dto.criticality as any,
      acquiredOn: dto.acquiredOn ? new Date(dto.acquiredOn as any) : undefined,
      ingestKey: dto.ingestKey,
      assetTopicPrefix: dto.assetTopicPrefix,
    } as any;

    try {
      return await this.withTenantRLS(async (tx) => {
        const existing = await tx.asset.findFirst({ where: { id } });
        if (!existing) throw new NotFoundException('Asset not found');
        return tx.asset.update({ where: { id }, data });
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('Another asset with this code already exists');
      }
      throw e;
    }
  }

  async remove(id: string) {
    if (!id) throw new BadRequestException('id is required');
    return this.withTenantRLS(async (tx) => {
      const existing = await tx.asset.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException('Asset not found');
      return tx.asset.update({ where: { id }, data: { status: AssetStatus.DECOMMISSIONED } });
    });
  }
}