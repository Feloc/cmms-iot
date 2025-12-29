import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../tenant-context';

/**
 * Permite acciones administrativas dentro del tenant actual.
 * Requiere:
 * - userId en tenantStorage (JWT válido)
 * - user.tenantId == store.tenantId
 * - role == ADMIN
 */
@Injectable()
export class TenantAdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(_ctx: ExecutionContext): Promise<boolean> {
    const store = tenantStorage.getStore();
    const tenantId = store?.tenantId;
    const userId = store?.userId;

    if (!userId) throw new UnauthorizedException('No autenticado');
    if (!tenantId) throw new UnauthorizedException('Tenant requerido');

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, role: true },
    });

    if (!user) throw new UnauthorizedException('Usuario no encontrado en este tenant');
    if (user.role !== 'ADMIN') throw new ForbiddenException('Se requiere rol ADMIN');

    return true;
  }
}
