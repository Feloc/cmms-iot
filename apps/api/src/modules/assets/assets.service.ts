import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}
  list(tenantId: string) { return this.prisma.asset.findMany({ where: { tenantId } }); }
}
