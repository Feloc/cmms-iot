import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  /**
   * Acepta slug o id de tenant en el 1er parámetro.
   * Valida que no venga vacío para evitar `slug: undefined`.
   */
  async validate(tenantSlugOrId: string | undefined, email: string, password: string) {
    const tenantKey = (tenantSlugOrId || '').trim();
    if (!tenantKey) {
      throw new BadRequestException('tenant es requerido');
    }

    // Busca por slug o por id (sigue siendo compatible con tu uso actual por slug)
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [{ slug: tenantKey }, { id: tenantKey }],
      },
    });
    if (!tenant) {
      throw new UnauthorizedException('Tenant inválido');
    }

    // Tu esquema actual guarda el hash en `password`
    const user = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, email },
    });
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const token = await this.jwt.signAsync({
      sub: user.id,
      tenantId: tenant.id,
      role: user.role,
      email: user.email,
    });

    return {
      token,
      tenant: { id: tenant.id, slug: tenant.slug },
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    };
  }
}
