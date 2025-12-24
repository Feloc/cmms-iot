import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PmPlansService } from './pm-plans.service';
import { CreatePmPlanDto } from './dto/create-pm-plan.dto';
import { UpdatePmPlanDto } from './dto/update-pm-plan.dto';

@Controller('pm-plans')
export class PmPlansController {
  constructor(private readonly service: PmPlansService) {}

  @Get()
  list(@Query('all') all?: string) {
    // all=1 incluye inactivos
    return this.service.list(all === '1' || all === 'true');
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Post()
  create(@Body() dto: CreatePmPlanDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePmPlanDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    // soft delete: active=false
    return this.service.remove(id);
  }
}
