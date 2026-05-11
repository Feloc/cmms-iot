import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { getTenant } from '../../common/tenant-context';
import { TenantAdminGuard } from '../../common/guards/tenant-admin.guard';
import { GoalsService } from './goals.service';

@Controller('goals')
export class GoalsController {
  constructor(private readonly svc: GoalsService) {}

  @Get('monthly/preventive-maintenance')
  async monthlyPreventiveMaintenance(@Query('period') period?: string) {
    const tenantId = getTenant();
    if (!tenantId) return null;
    return this.svc.monthlyPreventiveMaintenance(tenantId, period);
  }

  @Put('monthly/preventive-maintenance')
  @UseGuards(TenantAdminGuard)
  async setMonthlyPreventiveMaintenanceTarget(
    @Body() body: { period?: string; target?: number | string },
    @Query('period') period?: string,
  ) {
    const tenantId = getTenant();
    if (!tenantId) return null;
    return this.svc.setMonthlyPreventiveMaintenanceTarget(tenantId, body?.period || period, body?.target);
  }
}
