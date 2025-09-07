import { Controller, Get } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { getTenant } from '../../common/tenant-context';

@Controller('dashboard')
export class TelemetryController {
  constructor(private svc: TelemetryService) {}

  @Get()
  async kpis() {
    const tenantId = getTenant();
    if (!tenantId) return { error: 'Missing tenant' };
    return this.svc.kpis(tenantId);
  }
}
