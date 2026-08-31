import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ManufacturingSatService } from './manufacturing-sat.service';
import {
  CreateManufacturingSatEvidenceDto,
  CreateManufacturingSatExecutionDto,
  CreateManufacturingSatTemplateDto,
  DecideManufacturingSatDto,
  ManufacturingSatVersionDto,
  RecordManufacturingSatCaseDto,
  UpdateManufacturingSatDeviationDto,
} from './dto/manufacturing-sat.dto';

@Controller('manufacturing')
export class ManufacturingSatController {
  constructor(private readonly service: ManufacturingSatService) {}
  @Get('sat-templates') templates(@Query('active') active?: string) { return this.service.listTemplates(active); }
  @Post('sat-templates') createTemplate(@Body() dto: CreateManufacturingSatTemplateDto) { return this.service.createTemplate(dto); }
  @Get('orders/:orderId/sat-executions') list(@Param('orderId') orderId: string) { return this.service.list(orderId); }
  @Post('site-deployments/:deploymentId/sat-executions') create(@Param('deploymentId') deploymentId: string, @Body() dto: CreateManufacturingSatExecutionDto) { return this.service.createExecution(deploymentId, dto); }
  @Post('sat-executions/:executionId/start') start(@Param('executionId') executionId: string, @Body() dto: ManufacturingSatVersionDto) { return this.service.start(executionId, dto); }
  @Patch('sat-cases/:caseId/result') result(@Param('caseId') caseId: string, @Body() dto: RecordManufacturingSatCaseDto) { return this.service.recordCase(caseId, dto); }
  @Post('sat-cases/:caseId/evidence') evidence(@Param('caseId') caseId: string, @Body() dto: CreateManufacturingSatEvidenceDto) { return this.service.addEvidence(caseId, dto); }
  @Patch('sat-deviations/:deviationId') deviation(@Param('deviationId') deviationId: string, @Body() dto: UpdateManufacturingSatDeviationDto) { return this.service.updateDeviation(deviationId, dto); }
  @Post('sat-executions/:executionId/submit') submit(@Param('executionId') executionId: string, @Body() dto: ManufacturingSatVersionDto) { return this.service.submit(executionId, dto); }
  @Post('sat-executions/:executionId/decision') decision(@Param('executionId') executionId: string, @Body() dto: DecideManufacturingSatDto) { return this.service.decide(executionId, dto); }
}
