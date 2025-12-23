import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.inventoryItem.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  search(tenantId: string, q: string) {
    const s = q.trim();
    const where: Prisma.InventoryItemWhereInput = { tenantId };
    if (s) {
      where.OR = [
        { sku: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
        //{ model: { contains: s, mode: 'insensitive' } },
      ];
    }
    return this.prisma.inventoryItem.findMany({ where, take: 25, orderBy: { name: 'asc' } });
  }
}
