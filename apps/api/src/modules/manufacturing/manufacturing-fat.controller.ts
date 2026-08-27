import { Body, Controller, Get, Param, Post, Patch, Query } from '@nestjs/common';
import { ManufacturingFatService } from './manufacturing-fat.service';
import { CreateManufacturingFatEvidenceDto, CreateManufacturingFatExecutionDto, CreateManufacturingFatTemplateDto, DecideManufacturingFatDto, ManufacturingFatVersionDto, RecordManufacturingFatCaseDto, UpdateManufacturingFatDeviationDto } from './dto/manufacturing-fat.dto';

@Controller('manufacturing')
export class ManufacturingFatController {
  constructor(private readonly service: ManufacturingFatService) {}
  @Get('fat-templates') templates(@Query('active') active?: string) { return this.service.listTemplates(active); }
  @Post('fat-templates') createTemplate(@Body() dto: CreateManufacturingFatTemplateDto) { return this.service.createTemplate(dto); }
  @Get('orders/:orderId/fat-executions') list(@Param('orderId') orderId: string) { return this.service.list(orderId); }
  @Get('units/:unitId/dispatch-readiness') readiness(@Param('unitId') unitId: string) { return this.service.dispatchReadiness(unitId); }
  @Post('units/:unitId/fat-executions') create(@Param('unitId') unitId: string, @Body() dto: CreateManufacturingFatExecutionDto) { return this.service.createExecution(unitId, dto); }
  @Post('fat-executions/:executionId/start') start(@Param('executionId') executionId: string, @Body() dto: ManufacturingFatVersionDto) { return this.service.start(executionId, dto); }
  @Patch('fat-cases/:caseId/result') result(@Param('caseId') caseId: string, @Body() dto: RecordManufacturingFatCaseDto) { return this.service.recordCase(caseId, dto); }
  @Post('fat-cases/:caseId/evidence') evidence(@Param('caseId') caseId: string, @Body() dto: CreateManufacturingFatEvidenceDto) { return this.service.addEvidence(caseId, dto); }
  @Patch('fat-deviations/:deviationId') deviation(@Param('deviationId') deviationId: string, @Body() dto: UpdateManufacturingFatDeviationDto) { return this.service.updateDeviation(deviationId, dto); }
  @Post('fat-executions/:executionId/submit') submit(@Param('executionId') executionId: string, @Body() dto: ManufacturingFatVersionDto) { return this.service.submit(executionId, dto); }
  @Post('fat-executions/:executionId/decision') decision(@Param('executionId') executionId: string, @Body() dto: DecideManufacturingFatDto) { return this.service.decide(executionId, dto); }
}
