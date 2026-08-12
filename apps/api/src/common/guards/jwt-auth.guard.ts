import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { tenantStorage } from '../tenant-context';
import { PrismaService } from '../../prisma.service';

type AccessTokenPayload = {
  sub?: unknown;
  tenantId?: unknown;
  role?: unknown;
  email?: unknown;
  authVersion?: unknown;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = String(request.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Token requerido');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const userId = typeof payload.sub === 'string' ? payload.sub : '';
    const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId : '';
    if (!userId || !tenantId) throw new UnauthorizedException('Token incompleto');

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { authVersion: true },
    });
    const tokenAuthVersion = typeof payload.authVersion === 'number' ? payload.authVersion : -1;
    if (!user || user.authVersion !== tokenAuthVersion) {
      throw new UnauthorizedException('Sesión revocada');
    }

    // El tenant siempre procede del JWT verificado. Nunca de headers o query params.
    const store = tenantStorage.getStore();
    if (!store) throw new UnauthorizedException('Contexto de autenticación no disponible');
    store.userId = userId;
    store.tenantId = tenantId;
    (request as any).user = payload;
    return true;
  }
}
