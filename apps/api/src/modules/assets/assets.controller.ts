import {
  BadRequestException, Controller, Get, Post, Patch, Delete, Param, Body, Query, Res, UseInterceptors, UploadedFile
} from '@nestjs/common';
import type { Response } from 'express';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { GenerateAssetMaintenancePlanDto, UpsertAssetMaintenancePlanDto } from './dto/maintenance-plan.dto';
import { CreatePreventiveMaintenanceRecordDto } from './dto/create-preventive-maintenance-record.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { MulterFile } from '../../common/multer-file';

const ASSET_PHOTOS_DIR = process.env.ATTACHMENTS_DIR || path.resolve('./storage/attachments');
fs.mkdirSync(ASSET_PHOTOS_DIR, { recursive: true });
type FindAllQuery = {
  search?: string;
  serial?: string;
  name?: string;
  nameIn?: string[];
  brand?: string;
  model?: string;
  customer?: string;
  guarantee?: 'IN_WARRANTY' | 'OUT_OF_WARRANTY' | '';
  pmConfigured?: 'CONFIGURED' | 'UNCONFIGURED' | '';
  status?: 'COMMISSIONING' | 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED' | '';
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
    @Query('nameIn') nameIn?: string | string[],
    @Query('brand') brand?: string,
    @Query('model') model?: string,
    @Query('customer') customer?: string,
    @Query('guarantee') guarantee?: string,
    @Query('pmConfigured') pmConfigured?: string,
    @Query('status') status?: string,
    @Query('locationId') locationId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('orderBy') orderBy?: string,
  ) {
    const nameInList = Array.isArray(nameIn)
      ? nameIn.map((v) => String(v).trim()).filter(Boolean)
      : String(nameIn || '').split(',').map((v) => v.trim()).filter(Boolean);
    const q: FindAllQuery = {
      search,
      serial: serial || undefined,
      name: name || undefined,
      nameIn: nameInList.length ? nameInList : undefined,
      brand: brand || undefined,
      model: model || undefined,
      customer: customer || undefined,
      guarantee: (guarantee as any) || '',
      pmConfigured: (pmConfigured as any) || '',
      status: (status as any) || '',
      locationId: locationId || undefined,
      categoryId: categoryId || undefined,
      page: page ? Number(page) : undefined,
      size: size ? Number(size) : undefined,
      orderBy: (orderBy as any) || undefined,
    };
    return this.service.findAll(q as any);
  }

  @Get('filter-options')
  async getFilterOptions(
    @Query('serial') serial?: string,
    @Query('brand') brand?: string,
    @Query('model') model?: string,
    @Query('customer') customer?: string,
    @Query('guarantee') guarantee?: string,
    @Query('pmConfigured') pmConfigured?: string,
    @Query('status') status?: string,
  ) {
    const q: FindAllQuery = {
      serial: serial || undefined,
      brand: brand || undefined,
      model: model || undefined,
      customer: customer || undefined,
      guarantee: (guarantee as any) || '',
      pmConfigured: (pmConfigured as any) || '',
      status: (status as any) || '',
    };
    return this.service.getFilterOptions(q as any);
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

  @Get(':id/photo')
  async getPhoto(@Param('id') id: string, @Res() res: Response) {
    const photo = await this.service.getPhotoFile(id);
    const stat = fs.statSync(photo.path);
    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(photo.path).pipe(res);
  }

  @Post(':id/photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req: any, _file: any, cb: any) => cb(null, ASSET_PHOTOS_DIR),
        filename: (_req: any, file: any, cb: any) => {
          const extensions: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
          };
          cb(null, `${randomUUID()}${extensions[file.mimetype] || ''}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
        if (!allowed.has(file.mimetype)) {
          return cb(new BadRequestException('La foto debe ser JPEG, PNG o WebP') as any, false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadPhoto(@Param('id') id: string, @UploadedFile() file?: MulterFile) {
    if (!file) throw new BadRequestException('La foto es requerida');
    try {
      return await this.service.replacePhoto(id, file);
    } catch (error) {
      try { if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch {}
      throw error;
    }
  }

  @Delete(':id/photo')
  async deletePhoto(@Param('id') id: string) {
    return this.service.deletePhoto(id);
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
