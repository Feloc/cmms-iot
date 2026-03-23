import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseInterceptors, UploadedFile
} from '@nestjs/common';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { GenerateAssetMaintenancePlanDto, UpsertAssetMaintenancePlanDto } from './dto/maintenance-plan.dto';
import { CreatePreventiveMaintenanceRecordDto } from './dto/create-preventive-maintenance-record.dto';
import { FileInterceptor } from '@nestjs/platform-express';
type FindAllQuery = {
  search?: string;
  serial?: string;
  name?: string;
  model?: string;
  customer?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED' | '';
  locationId?: string;
  categoryId?: string;
  page?: number; // 1-based
  size?: number; // page size
  orderBy?: 'createdAt:desc' | 'createdAt:asc' | 'name:asc' | 'name:desc';
};

@Controller('assets')
export class AssetsController {
  constructor(private readonly service: AssetsService) { }


  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('serial') serial?: string,
    @Query('name') name?: string,
    @Query('model') model?: string,
    @Query('customer') customer?: string,
    @Query('status') status?: string,
    @Query('locationId') locationId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('orderBy') orderBy?: string,
  ) {
    const q: FindAllQuery = {
      search,
      serial: serial || undefined,
      name: name || undefined,
      model: model || undefined,
      customer: customer || undefined,
      status: (status as any) || '',
      locationId: locationId || undefined,
      categoryId: categoryId || undefined,
      page: page ? Number(page) : undefined,
      size: size ? Number(size) : undefined,
      orderBy: (orderBy as any) || undefined,
    };
    return this.service.findAll(q as any);
  }

  @Get('hourmeter-analytics/risk')
  async getHourmeterRisk(
    @Query('limit') limit?: string,
    @Query('customer') customer?: string,
  ) {
    return this.service.getHourmeterRisk(limit ? Number(limit) : undefined, customer);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }


@Get(':id/service-order-parts')
async listServiceOrderParts(@Param('id') id: string) {
  return this.service.listServiceOrderParts(id);
}

@Get(':id/maintenance-plan')
async getMaintenancePlan(@Param('id') id: string) {
  return this.service.getMaintenancePlan(id);
}

@Get(':id/hourmeter-readings')
async getHourmeterReadings(@Param('id') id: string, @Query('limit') limit?: string) {
  return this.service.getHourmeterReadings(id, limit ? Number(limit) : undefined);
}

@Get(':id/hourmeter-analytics/summary')
async getHourmeterAnalyticsSummary(
  @Param('id') id: string,
  @Query('from') from?: string,
  @Query('to') to?: string,
) {
  return this.service.getHourmeterAnalyticsSummary(id, from, to);
}

@Get(':id/hourmeter-analytics/series')
async getHourmeterAnalyticsSeries(
  @Param('id') id: string,
  @Query('from') from?: string,
  @Query('to') to?: string,
  @Query('bucket') bucket?: string,
) {
  return this.service.getHourmeterAnalyticsSeries(id, from, to, bucket);
}

@Get(':id/hourmeter-analytics/pm-performance')
async getHourmeterPmPerformance(
  @Param('id') id: string,
  @Query('limit') limit?: string,
) {
  return this.service.getHourmeterPmPerformance(id, limit ? Number(limit) : undefined);
}

  @Post()
  async create(@Body() dto: CreateAssetDto) {
    return this.service.create(dto as any);
  }


  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.service.update(id, dto as any);
  }

  @Patch(':id/maintenance-plan')
  async upsertMaintenancePlan(@Param('id') id: string, @Body() dto: UpsertAssetMaintenancePlanDto) {
    return this.service.upsertMaintenancePlan(id, dto);
  }

  @Post(':id/maintenance-plan/generate')
  async generateMaintenancePlan(@Param('id') id: string, @Body() dto: GenerateAssetMaintenancePlanDto) {
    return this.service.generateMaintenancePlan(id, dto ?? {});
  }

  @Post(':id/preventive-maintenance-records')
  async createPreventiveMaintenanceRecord(@Param('id') id: string, @Body() dto: CreatePreventiveMaintenanceRecordDto) {
    return this.service.createPreventiveMaintenanceRecord(id, dto);
  }


  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
