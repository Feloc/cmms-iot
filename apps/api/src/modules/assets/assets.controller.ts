import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseInterceptors, UploadedFile
} from '@nestjs/common';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportCommitOptionsDto } from './dto/import.dto';


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


  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }


@Get(':id/service-order-parts')
async listServiceOrderParts(@Param('id') id: string) {
  return this.service.listServiceOrderParts(id);
}

  @Post()
  async create(@Body() dto: CreateAssetDto) {
    return this.service.create(dto as any);
  }


  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.service.update(id, dto as any);
  }


  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}