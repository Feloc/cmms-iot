import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { TenantAdminGuard } from '../../common/guards/tenant-admin.guard';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  controllers: [AdminUsersController],
  providers: [AdminUsersService, PrismaService, TenantAdminGuard],
})
export class AdminUsersModule {}
