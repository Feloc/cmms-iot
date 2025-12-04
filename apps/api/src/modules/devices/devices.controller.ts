import { Controller, Get, Post, Patch, Delete, Param, Body, Query, BadRequestException } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { tenantStorage } from '../../common/tenant-context';

@Controller()
export class DevicesController {
  constructor(private readonly svc: DevicesService) {}

  private getTenantId(): string {
    const t = tenantStorage.getStore()?.tenantId;
    if (!t) throw new BadRequestException('No tenant in context');
    return t;
  }

  @Get('devices')
  async list(@Query('page') page = '1', @Query('size') size = '20', @Query('q') q?: string) {
    const tenantId = this.getTenantId();
    const p = Math.max(1, parseInt(page as any, 10) || 1);
    const s = Math.max(1, Math.min(200, parseInt(size as any, 10) || 20));
    return this.svc.list(tenantId, p, s, q);
  }

  @Get('devices/:id')
  async byId(@Param('id') id: string) {
    const tenantId = this.getTenantId();
    return this.svc.byId(tenantId, id);
  }

  @Post('devices')
  async create(@Body() dto: CreateDeviceDto) {
    const tenantId = this.getTenantId();
    return this.svc.create(tenantId, dto);
  }

  @Patch('devices/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    const tenantId = this.getTenantId();
    return this.svc.update(tenantId, id, dto);
  }

  @Delete('devices/:id')
  async remove(@Param('id') id: string) {
    const tenantId = this.getTenantId();
    return this.svc.remove(tenantId, id);
  }

  @Get('assets/:assetId/devices')
  async byAsset(@Param('assetId') assetId: string) {
    const tenantId = this.getTenantId();
    return this.svc.listByAsset(tenantId, assetId);
  }

  @Post('devices/:id/ping')
  async ping(@Param('id') id: string) {
    const tenantId = this.getTenantId();
    return this.svc.ping(tenantId, id);
  }
}
