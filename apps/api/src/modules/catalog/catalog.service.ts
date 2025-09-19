import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';

type Params = { q?: string; assetType?: string; limit?: number };

@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  private getTenantId() {
    const t = tenantStorage.getStore();
    if (!t?.tenantId) throw new Error('No tenant in context');
    return t.tenantId;
  }

  listSymptomCodes({ q, assetType, limit = 20 }: Params) {
    const tenantId = this.getTenantId();
    return this.prisma.symptomCode.findMany({
      where: {
        tenantId,
        enabled: true,
        ...(assetType ? { assetType } : {}),
        ...(q
          ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
      take: limit,
      select: { id: true, code: true, name: true },
    });
  }

  listCauseCodes({ q, assetType, limit = 20 }: Params) {
    const tenantId = this.getTenantId();
    return this.prisma.causeCode.findMany({
      where: {
        tenantId,
        enabled: true,
        ...(assetType ? { assetType } : {}),
        ...(q
          ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
      take: limit,
      select: { id: true, code: true, name: true },
    });
  }

  listRemedyCodes({ q, assetType, limit = 20 }: Params) {
    const tenantId = this.getTenantId();
    return this.prisma.remedyCode.findMany({
      where: {
        tenantId,
        enabled: true,
        ...(assetType ? { assetType } : {}),
        ...(q
          ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
      take: limit,
      select: { id: true, code: true, name: true },
    });
  }
}
