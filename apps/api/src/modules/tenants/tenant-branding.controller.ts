import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { TenantAdminGuard } from '../../common/guards/tenant-admin.guard';
import { getTenant } from '../../common/tenant-context';
import { TenantsService } from './tenants.service';
import { UpdateTenantBrandingDto } from './dto/update-tenant-branding.dto';

@Controller('tenant-branding')
@UseGuards(TenantAdminGuard) // solo ADMIN del tenant actual
export class TenantBrandingController {
  constructor(private svc: TenantsService) {}

  @Get()
  getCurrentTenantBranding() {
    const tenantId = getTenant();
    if (!tenantId) throw new BadRequestException('No tenant in context');
    return this.svc.getBranding(tenantId);
  }

  @Patch()
  updateCurrentTenantBranding(@Body() dto: UpdateTenantBrandingDto) {
    const tenantId = getTenant();
    if (!tenantId) throw new BadRequestException('No tenant in context');
    return this.svc.updateBranding(tenantId, dto);
  }
}
