import { Controller, Get } from '@nestjs/common';
import { WorkordersService } from './workorders.service';
import { getTenant } from '../../common/tenant-context';

@Controller('work-orders')
export class WorkordersController {
  constructor(private svc: WorkordersService) {}
  @Get()
  async list() {
    const tenantId = getTenant();
    if (!tenantId) return [];
    return this.svc.list(tenantId);
  }
}
