import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';

@Injectable()
export class PmPlansService {
  constructor(private prisma: PrismaService) {}

  private getTenantId(): string {
    const t = tenantStorage.getStore();
    if (!t?.tenantId) throw new Error('No tenant in context');
    return t.tenantId;
  }

  list() {
    const tenantId = this.getTenantId();
    return this.prisma.pmPlan.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  async create(dto: { name: string; intervalHours?: number; checklist?: any }) {
    const tenantId = this.getTenantId();
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('name required');
    return this.prisma.pmPlan.create({
      data: { tenantId, name, intervalHours: dto.intervalHours, checklist: dto.checklist },
    });
  }
}
