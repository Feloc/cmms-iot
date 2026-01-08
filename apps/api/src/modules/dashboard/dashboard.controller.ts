import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { getTenant } from '../../common/tenant-context';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('summary')
  async summary(
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const tenantId = getTenant();
    if (!tenantId) {
      return {
        range: null,
        assets: null,
        service: null,
        alerts: null,
      };
    }

    const parsedDays = days ? Number(days) : undefined;
    return this.svc.summary({
      tenantId,
      days: Number.isFinite(parsedDays) ? parsedDays : undefined,
      from,
      to,
    });
  }
}
