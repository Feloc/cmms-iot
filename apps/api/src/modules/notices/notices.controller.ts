import { Controller, Get } from '@nestjs/common';
import { NoticesService } from './notices.service';
import { getTenant } from '../../common/tenant-context';

@Controller('notices')
export class NoticesController {
  constructor(private svc: NoticesService) {}
  @Get()
  async list() {
    const tenantId = getTenant();
    if (!tenantId) return [];
    return this.svc.list(tenantId);
  }
}
