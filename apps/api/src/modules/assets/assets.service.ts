import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  private getTenantId(): string {
    const { tenantId } = tenantStorage.getStore() || {};
    if (!tenantId) throw new Error('No tenant in context...');
    return tenantId;
  }

  async findAll() {
    const tenantId = this.getTenantId();
    return this.prisma.asset.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true, name: true, type: true, location: true, createdAt: true, updatedAt: true },
    });
  }

  async findOne(id: string) {
    const tenantId = this.getTenantId();
    const asset = await this.prisma.asset.findFirst({
      where: { id, tenantId },
      select: { id: true, code: true, name: true, type: true, location: true, createdAt: true, updatedAt: true },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  async create(dto: CreateAssetDto) {
    const tenantId = this.getTenantId();
    try {
      return await this.prisma.asset.create({
        data: { tenantId, ...dto },
        select: { id: true, code: true, name: true, type: true, location: true, createdAt: true, updatedAt: true },
      });
    } catch (e: any) {
      // P2002 = unique constraint
      if (e?.code === 'P2002') throw new ConflictException('Asset code already exists');
      throw e;
    }
  }

  async update(id: string, dto: UpdateAssetDto) {
    const tenantId = this.getTenantId();
    // asegura pertenencia
    const existing = await this.prisma.asset.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Asset not found');
    try {
      return await this.prisma.asset.update({
        where: { id },
        data: dto,
        select: { id: true, code: true, name: true, type: true, location: true, createdAt: true, updatedAt: true },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Asset code already exists');
      throw e;
    }
  }

  async remove(id: string) {
    const tenantId = this.getTenantId();
    const existing = await this.prisma.asset.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Asset not found');
    await this.prisma.asset.delete({ where: { id } });
    return { ok: true };
  }
}
