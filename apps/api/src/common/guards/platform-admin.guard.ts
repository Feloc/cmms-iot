import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../tenant-context';

/**
 * Permite ejecutar acciones "platform" (crear tenants, provisionar tenant+admin)
 * a usuarios que cumplan alguna de estas condiciones:
 * - Están logueados en el tenant PLATFORM (por slug) y su role es ADMIN
 * - Su email está en la allowlist SUPERADMIN_EMAILS (CSV). Útil para bootstrap.
 *
 * Variables env:
 * - PLATFORM_TENANT_SLUG (default: "platform")
 * - SUPERADMIN_EMAILS (CSV opcional: "a@x.com,b@y.com")
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(_ctx: ExecutionContext): Promise<boolean> {
    const store = tenantStorage.getStore();
    const userId = store?.userId;

    if (!userId) throw new UnauthorizedException('No autenticado');

    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        tenant: { select: { id: true, slug: true } },
      },
    });

    if (!user) throw new UnauthorizedException('Usuario no encontrado');

    const platformSlug = (process.env.PLATFORM_TENANT_SLUG || 'platform').trim().toLowerCase();
    const superEmails = (process.env.SUPERADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const isSuper = superEmails.includes((user.email || '').toLowerCase());
    const isPlatformTenant = (user.tenant?.slug || '').toLowerCase() === platformSlug;

    if (!isSuper && !isPlatformTenant) {
      throw new ForbiddenException('Acción permitida solo desde platform (o superadmin)');
    }

    if (isPlatformTenant && user.role !== 'ADMIN') {
      throw new ForbiddenException('Se requiere rol ADMIN en platform');
    }

    return true;
  }
}
