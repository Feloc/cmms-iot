import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class NoticesService {
  constructor(private prisma: PrismaService) {}
  list(tenantId: string) { return this.prisma.notice.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }); }
}
