import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private getTenantId(): string {
    const t = tenantStorage.getStore();
    if (!t?.tenantId) throw new Error('No tenant in context');
    return t.tenantId;
  }

  async list(role?: string) {
    const tenantId = this.getTenantId();
    const where: any = { tenantId };
    if (role) where.role = role as any;

    // devolvemos campos mínimos para dropdowns
    return this.prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
  }
}
