import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { getTenant } from '../../common/tenant-context';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { InventoryLedgerService } from './inventory-ledger.service';
import { InventoryManualsService } from './inventory-manuals.service';

@Controller(['inventory', 'inventory-items'])
export class InventoryController {
  constructor(
    private svc: InventoryService,
    private ledger: InventoryLedgerService,
    private manuals: InventoryManualsService,
  ) {}

  @Get('manuals')
  async listManuals(@Query('q') q?: string) {
    const tenantId = getTenant();
    if (!tenantId) return [];
    return this.manuals.listManuals(tenantId, q ?? '');
  }

  @Get('manuals/by-model')
  async getManualByModel(
    @Query('model') model?: string,
    @Query('brand') brand?: string,
    @Query('variant') variant?: string,
  ) {
    const tenantId = getTenant();
    if (!tenantId) return null;
    return this.manuals.getManualByModel(tenantId, { model, brand, variant });
  }

  @Get('manuals/:id')
  async getManualById(@Param('id') id: string) {
    const tenantId = getTenant();
    if (!tenantId) return null;
    return this.manuals.getManualById(tenantId, id);
  }

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

  @Get('movements')
  async movements(
    @Query('q') q?: string,
    @Query('inventoryItemId') inventoryItemId?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = getTenant();
    if (!tenantId) return [];
    await this.svc.assertAdmin(tenantId);
    return this.ledger.listMovements(tenantId, {
      q,
      inventoryItemId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post()
  async create(@Body() dto: CreateInventoryItemDto) {
    const tenantId = getTenant();
    if (!tenantId) throw new BadRequestException('No tenant in context');
    return this.svc.create(tenantId, dto);
  }

  @Post('manuals')
  async createManual(@Body() dto: unknown) {
    const tenantId = getTenant();
    if (!tenantId) throw new BadRequestException('No tenant in context');
    return this.manuals.createManual(tenantId, (dto ?? {}) as any);
  }

  @Patch('manuals/:id')
  async updateManual(@Param('id') id: string, @Body() dto: unknown) {
    const tenantId = getTenant();
    if (!tenantId) throw new BadRequestException('No tenant in context');
    return this.manuals.updateManual(tenantId, id, (dto ?? {}) as any);
  }

  @Delete('manuals/:id')
  async deleteManual(@Param('id') id: string) {
    const tenantId = getTenant();
    if (!tenantId) throw new BadRequestException('No tenant in context');
    return this.manuals.deleteManual(tenantId, id);
  }
}
