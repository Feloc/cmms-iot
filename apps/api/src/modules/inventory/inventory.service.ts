import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class InventoryService { constructor(private prisma: PrismaService) {}
  list(tenantId: string) { return this.prisma.inventoryItem.findMany({ where: { tenantId } }); }
}
