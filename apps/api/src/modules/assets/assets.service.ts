import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';

export interface CreateAssetDto {
  code: string;
  name: string;
  type?: string;
  location?: string;
}
export interface UpdateAssetDto {
  name?: string;
  type?: string;
  location?: string;
}

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const { tenantId } = tenantStorage.getStore() || {};
    return this.prisma.asset.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateAssetDto) {
    const { tenantId } = tenantStorage.getStore() || {};
    if (!tenantId) throw new Error('No tenant in context');
    return this.prisma.asset.create({
      data: { tenantId, code: dto.code, name: dto.name, type: dto.type, location: dto.location },
    });
  }

  async update(id: string, dto: UpdateAssetDto) {
    const { tenantId } = tenantStorage.getStore() || {};
    if (!tenantId) throw new Error('No tenant in context');
    return this.prisma.asset.update({ where: { id, tenantId }, data: dto });
  }

  async remove(id: string) {
    const { tenantId } = tenantStorage.getStore() || {};
    if (!tenantId) throw new Error('No tenant in context');
    await this.prisma.asset.delete({ where: { id, tenantId } });
    return { ok: true };
  }
}
