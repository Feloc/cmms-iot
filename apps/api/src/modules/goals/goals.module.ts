import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { TenantAdminGuard } from '../../common/guards/tenant-admin.guard';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  controllers: [GoalsController],
  providers: [GoalsService, PrismaService, TenantAdminGuard],
})
export class GoalsModule {}
