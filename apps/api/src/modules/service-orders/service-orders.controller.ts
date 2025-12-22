import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ServiceOrdersService } from './service-orders.service';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import { ScheduleServiceOrderDto } from './dto/schedule-service-order.dto';
import { ServiceOrderTimestampsDto } from './dto/timestamps.dto';
import { ServiceOrderFormDataDto } from './dto/form-data.dto';
import { ServiceOrderSignaturesDto } from './dto/signatures.dto';
import { AddServiceOrderPartDto } from './dto/parts.dto';
import { ListServiceOrdersQuery } from './dto/list-service-orders.query';

@Controller('service-orders')
export class ServiceOrdersController {
  constructor(private svc: ServiceOrdersService) {}

  @Get()
  list(@Query() q: ListServiceOrdersQuery) {
    return this.svc.list(q);
  }

  @Post()
  create(@Body() dto: CreateServiceOrderDto) {
    return this.svc.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateServiceOrderDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/schedule')
  schedule(@Param('id') id: string, @Body() dto: ScheduleServiceOrderDto) {
    return this.svc.schedule(id, dto);
  }

  @Patch(':id/timestamps')
  timestamps(@Param('id') id: string, @Body() dto: ServiceOrderTimestampsDto) {
    return this.svc.setTimestamps(id, dto);
  }

  @Patch(':id/form')
  form(@Param('id') id: string, @Body() dto: ServiceOrderFormDataDto) {
    return this.svc.setFormData(id, dto);
  }

  @Patch(':id/signatures')
  signatures(@Param('id') id: string, @Body() dto: ServiceOrderSignaturesDto) {
    return this.svc.setSignatures(id, dto);
  }

  @Post(':id/parts')
  addPart(@Param('id') id: string, @Body() dto: AddServiceOrderPartDto) {
    return this.svc.addPart(id, dto);
  }

  @Delete(':id/parts/:partId')
  removePart(@Param('id') id: string, @Param('partId') partId: string) {
    return this.svc.removePart(id, partId);
  }
}
