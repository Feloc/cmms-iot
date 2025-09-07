import { Controller, Get } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { getTenant } from '../../common/tenant-context';

@Controller('assets')
export class AssetsController {
  constructor(private svc: AssetsService) {}
  @Get()
  async list() {
    const tenantId = getTenant();
    if (!tenantId) return [];
    return this.svc.list(tenantId);
  }
}
