import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { TenantAdminGuard } from '../../common/guards/tenant-admin.guard';
import { TenantsController } from './tenants.controller';
import { TenantBrandingController } from './tenant-branding.controller';
import { TenantsService } from './tenants.service';

@Module({
  controllers: [TenantsController, TenantBrandingController],
  providers: [TenantsService, PrismaService, PlatformAdminGuard, TenantAdminGuard],
})
export class TenantsModule {}
