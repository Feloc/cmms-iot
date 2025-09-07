import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}
  recent(tenantId: string) { return this.prisma.alert.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 }); }
}
