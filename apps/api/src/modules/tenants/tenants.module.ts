import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, PrismaService, PlatformAdminGuard],
})
export class TenantsModule {}
