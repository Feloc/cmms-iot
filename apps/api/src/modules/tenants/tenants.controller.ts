import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ListTenantsQuery } from './dto/list-tenants.query';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(PlatformAdminGuard) // 🔒 solo platform/superadmin
export class TenantsController {
  constructor(private svc: TenantsService) {}

  @Get()
  list(@Query() q: ListTenantsQuery) {
    return this.svc.list(q);
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.svc.create(dto);
  }

  // Tenant + primer ADMIN (provisionamiento)
  @Post('provision')
  provision(@Body() dto: ProvisionTenantDto) {
    return this.svc.provision(dto);
  }
}
