import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ListTenantsQuery } from './dto/list-tenants.query';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async list(q: ListTenantsQuery) {
    const page = Math.max(1, Number(q.page ?? 1));
    const size = Math.min(100, Math.max(1, Number(q.size ?? 20)));
    const skip = (page - 1) * size;

    const where = q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' as const } },
            { slug: { contains: q.q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: size,
        select: { id: true, name: true, slug: true, createdAt: true },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { items, total, page, size };
  }

  async create(dto: CreateTenantDto) {
    const name = dto.name.trim();
    const slug = dto.slug.trim().toLowerCase();

    const exists = await this.prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
    if (exists) throw new BadRequestException('Ya existe un tenant con ese slug.');

    return this.prisma.tenant.create({
      data: { name, slug },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
  }

  async provision(dto: ProvisionTenantDto) {
    const name = dto.name.trim();
    const slug = dto.slug.trim().toLowerCase();

    const adminName = dto.adminName.trim();
    const adminEmail = dto.adminEmail.trim().toLowerCase();
    const adminPassword = dto.adminPassword;

    const exists = await this.prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
    if (exists) throw new BadRequestException('Ya existe un tenant con ese slug.');

    const passwordHash = await bcrypt.hash(adminPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name, slug },
        select: { id: true, name: true, slug: true, createdAt: true },
      });

      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: adminName,
          email: adminEmail,
          role: 'ADMIN',
          password: passwordHash,
        } as any,
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });

      return { tenant, admin };
    });
  }
}
