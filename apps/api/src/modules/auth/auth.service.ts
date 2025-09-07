import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async validate(tenantSlug: string, email: string, password: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new UnauthorizedException('Tenant inválido');

    const user = await this.prisma.user.findFirst({ where: { tenantId: tenant.id, email } });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');

    const token = await this.jwt.signAsync({ sub: user.id, tenantId: tenant.id, role: user.role, email: user.email });
    return { token, tenant: { id: tenant.id, slug: tenant.slug }, user: { id: user.id, email: user.email, role: user.role, name: user.name } };
  }
}
