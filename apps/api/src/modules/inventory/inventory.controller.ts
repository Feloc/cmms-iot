import { Controller, Get, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { getTenant } from '../../common/tenant-context';

@Controller('inventory')
export class InventoryController {
  constructor(private svc: InventoryService) {}

  @Get()
  async list() {
    const tenantId = getTenant();
    if (!tenantId) return [];
    return this.svc.list(tenantId);
  }

  @Get('search')
  async search(@Query('q') q?: string) {
    const tenantId = getTenant();
    if (!tenantId) return [];
    return this.svc.search(tenantId, q ?? '');
  }
}
