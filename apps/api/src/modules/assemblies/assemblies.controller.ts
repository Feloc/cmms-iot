import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AssembliesService } from './assemblies.service';
import {
  BlockAssemblyActivityDto,
  CompleteAssemblyActivityDto,
  CreateAssemblyDto,
  CreateAssemblyTemplateDto,
  UpdateAssemblyActivityDto,
  UpdateAssemblyOperationalAlertDto,
  UpdateAssemblyScheduleDto,
  UpdateAssemblyTemplateDto,
  UpdateAssemblySignaturesDto,
} from './dto/assemblies.dto';

@Controller('assemblies')
export class AssembliesController {
  constructor(private readonly svc: AssembliesService) {}

  @Get('templates')
  templates(@Query('active') active?: string) {
    return this.svc.listTemplates(active);
  }

  @Post('templates')
  createTemplate(@Body() dto: CreateAssemblyTemplateDto) {
    return this.svc.createTemplate(dto);
  }

  @Patch('templates/:templateId')
  updateTemplate(@Param('templateId') templateId: string, @Body() dto: UpdateAssemblyTemplateDto) {
    return this.svc.updateTemplate(templateId, dto);
  }

  @Get()
  list(@Query('status') status?: string) {
    return this.svc.list(status);
  }

  @Post()
  create(@Body() dto: CreateAssemblyDto) {
    return this.svc.create(dto);
  }

  @Get('operational-alerts')
  operationalAlerts(@Query('status') status?: string) {
    return this.svc.listOperationalAlerts(status);
  }

  @Patch('operational-alerts/:alertId')
  updateOperationalAlert(@Param('alertId') alertId: string, @Body() dto: UpdateAssemblyOperationalAlertDto) {
    return this.svc.updateOperationalAlert(alertId, dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id/signatures')
  updateSignatures(@Param('id') id: string, @Body() dto: UpdateAssemblySignaturesDto) {
    return this.svc.updateSignatures(id, dto);
  }

  @Patch(':id/schedule')
  updateSchedule(@Param('id') id: string, @Body() dto: UpdateAssemblyScheduleDto) {
    return this.svc.updateSchedule(id, dto);
  }

  @Patch(':id/activities/:activityId')
  updateActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateAssemblyActivityDto,
  ) {
    return this.svc.updateActivity(id, activityId, dto);
  }

  @Post(':id/activities/:activityId/start')
  startActivity(@Param('id') id: string, @Param('activityId') activityId: string) {
    return this.svc.startActivity(id, activityId);
  }

  @Post(':id/activities/:activityId/pause')
  pauseActivity(@Param('id') id: string, @Param('activityId') activityId: string) {
    return this.svc.pauseActivity(id, activityId);
  }

  @Post(':id/activities/:activityId/block')
  blockActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() dto: BlockAssemblyActivityDto,
  ) {
    return this.svc.blockActivity(id, activityId, dto);
  }

  @Post(':id/activities/:activityId/complete')
  completeActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() dto: CompleteAssemblyActivityDto,
  ) {
    return this.svc.completeActivity(id, activityId, dto);
  }
}
