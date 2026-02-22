import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { getTenant } from '../../common/tenant-context';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';

@Controller(['inventory', 'inventory-items'])
export class InventoryController {
  constructor(private svc: InventoryService) {}

  @Get()
  async list(@Query('q') q?: string) {
    const tenantId = getTenant();
    if (!tenantId) return [];
    return this.svc.list(tenantId, q ?? '');
  }

  @Get('search')
  async search(@Query('q') q?: string) {
    const tenantId = getTenant();
    if (!tenantId) return [];
    return this.svc.search(tenantId, q ?? '');
  }

  @Post()
  async create(@Body() dto: CreateInventoryItemDto) {
    const tenantId = getTenant();
    if (!tenantId) throw new BadRequestException('No tenant in context');
    return this.svc.create(tenantId, dto);
  }
}
