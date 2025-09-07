import { Controller, Get } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { getTenant } from '../../common/tenant-context';

@Controller('alerts')
export class AlertsController {
  constructor(private svc: AlertsService) {}
  @Get('recent')
  async recent() {
    const tenantId = getTenant();
    if (!tenantId) return [];
    return this.svc.recent(tenantId);
  }
}
