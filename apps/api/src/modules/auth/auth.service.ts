import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { LoginAttemptsService } from './login-attempts.service';

// Comparación de coste equivalente cuando tenant/usuario no existen.
const DUMMY_PASSWORD_HASH = '$2b$10$3ED7iJYMGa3FvC/UWxiF1OdIVT1TnN.AAj/3rZ8CGvgnPPg6z9LOq';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private attempts: LoginAttemptsService,
  ) {}

  /**
   * Acepta slug o id de tenant en el 1er parámetro.
   * Valida que no venga vacío para evitar `slug: undefined`.
   */
  async validate(tenantSlugOrId: string | undefined, email: string, password: string) {
    const tenantKey = (tenantSlugOrId || '').trim().toLowerCase();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const attemptKey = this.attempts.key(tenantKey, normalizedEmail);
    this.attempts.assertAllowed(attemptKey);
    if (!tenantKey) {
      throw new BadRequestException('tenant es requerido');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantKey } });
    if (!tenant) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      this.attempts.failure(attemptKey);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Tu esquema actual guarda el hash en `password`
    const user = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, email: normalizedEmail },
    });
    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      this.attempts.failure(attemptKey);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      this.attempts.failure(attemptKey);
      throw new UnauthorizedException('Credenciales inválidas');
    }
    this.attempts.success(attemptKey);

    const token = await this.jwt.signAsync({
      sub: user.id,
      tenantId: tenant.id,
      role: user.role,
      email: user.email,
      authVersion: user.authVersion,
    });

    return {
      token,
      tenant: { id: tenant.id, slug: tenant.slug },
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    };
  }

  async revoke(userId: string, tenantId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId, tenantId },
      data: { authVersion: { increment: 1 } },
    });
    return { ok: true };
  }
}
