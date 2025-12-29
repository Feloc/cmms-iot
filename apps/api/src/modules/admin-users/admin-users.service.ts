import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ListAdminUsersQuery } from './dto/list-admin-users.query';
import * as bcrypt from 'bcrypt';

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

@Injectable()
export class AdminUsersService {
  constructor(private prisma: PrismaService) {}

  private getTenantId(): string {
    const t = tenantStorage.getStore();
    if (!t?.tenantId) throw new Error('No tenant in context');
    return t.tenantId;
  }

  async list(q: ListAdminUsersQuery) {
    const tenantId = this.getTenantId();
    const page = Math.max(1, Number(q.page ?? 1));
    const size = Math.min(100, Math.max(1, Number(q.size ?? 20)));
    const skip = (page - 1) * size;

    const where: any = { tenantId };

    if (q.role) where.role = q.role;

    if (q.q) {
      const s = String(q.q).trim();
      if (s) {
        where.OR = [
          { name: { contains: s, mode: 'insensitive' } },
          { email: { contains: s, mode: 'insensitive' } },
        ];
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: size,
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, size };
  }

  async create(dto: CreateAdminUserDto) {
    const tenantId = this.getTenantId();
    const email = normalizeEmail(dto.email);
    const name = dto.name.trim();
    const role = dto.role; // validated by DTO as Role enum

    const existing = await this.prisma.user.findFirst({ where: { tenantId, email }, select: { id: true } });
    if (existing) throw new BadRequestException('Ya existe un usuario con ese email en este tenant.');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        tenantId,
        name,
        email,
        role,
        password: passwordHash,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
  }
}
