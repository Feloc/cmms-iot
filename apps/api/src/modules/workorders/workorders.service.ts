import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class WorkordersService { constructor(private prisma: PrismaService) {}
  list(tenantId: string) { return this.prisma.workOrder.findMany({ where: { tenantId } }); }
}
