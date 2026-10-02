import { UseGuards, UsePipes } from '@nestjs/common';
import { ManufacturingAccessGuard } from './manufacturing-access.guard';
import { ManufacturingValidationPipe } from './manufacturing-validation.pipe';
import { Body, Controller, Get, Param, Post, Patch, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FAT_IMPORT_MAX_BYTES, fatProtocolExample, previewFatProtocol } from './manufacturing-fat-import';
import { ManufacturingFatService } from './manufacturing-fat.service';
import { CreateManufacturingFatDeviationDto } from './dto/manufacturing-fat.dto';
import { CreateManufacturingFatEvidenceDto, CreateManufacturingFatExecutionDto, CreateManufacturingFatTemplateDto, DecideManufacturingFatDto, ManufacturingFatVersionDto, RecordManufacturingFatCaseDto, UpdateManufacturingFatDeviationDto } from './dto/manufacturing-fat.dto';

@UseGuards(ManufacturingAccessGuard)
@UsePipes(ManufacturingValidationPipe)
@Controller('manufacturing')
export class ManufacturingFatController {
  constructor(private readonly service: ManufacturingFatService) {}
  @Get('fat-templates') templates(@Query('active') active?: string) { return this.service.listTemplates(active); }
  @Post('fat-templates') createTemplate(@Body() dto: CreateManufacturingFatTemplateDto) { return this.service.createTemplate(dto); }
  @Post('fat-templates/import/preview')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: FAT_IMPORT_MAX_BYTES, files: 1, fields: 0 } }))
  previewTemplate(@UploadedFile() file?: { originalname: string; buffer: Buffer }) { return previewFatProtocol(file); }
  @Get('fat-templates/import/example')
  templateExample(@Query('format') format = 'xlsx') {
    return new StreamableFile(fatProtocolExample(format), { type: format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disposition: `attachment; filename="protocolo-fat.${format}"` });
  }
  @Get('orders/:orderId/fat-executions') list(@Param('orderId') orderId: string) { return this.service.list(orderId); }
  @Get('orders/:orderId/fat-assignees') assignees(@Param('orderId') orderId: string) { return this.service.findingAssignees(orderId); }
  @Post('fat-cases/:caseId/deviations') createDeviation(@Param('caseId') caseId: string, @Body() dto: CreateManufacturingFatDeviationDto) { return this.service.createDeviation(caseId, dto); }
  @Post('fat-deviations/:deviationId/evidence') deviationEvidence(@Param('deviationId') deviationId: string, @Body() dto: CreateManufacturingFatEvidenceDto) { return this.service.addDeviationEvidence(deviationId, dto); }
  @Get('units/:unitId/dispatch-readiness') readiness(@Param('unitId') unitId: string) { return this.service.dispatchReadiness(unitId); }
  @Post('units/:unitId/fat-executions') create(@Param('unitId') unitId: string, @Body() dto: CreateManufacturingFatExecutionDto) { return this.service.createExecution(unitId, dto); }
  @Post('fat-executions/:executionId/start') start(@Param('executionId') executionId: string, @Body() dto: ManufacturingFatVersionDto) { return this.service.start(executionId, dto); }
  @Patch('fat-cases/:caseId/result') result(@Param('caseId') caseId: string, @Body() dto: RecordManufacturingFatCaseDto) { return this.service.recordCase(caseId, dto); }
  @Post('fat-cases/:caseId/evidence') evidence(@Param('caseId') caseId: string, @Body() dto: CreateManufacturingFatEvidenceDto) { return this.service.addEvidence(caseId, dto); }
  @Patch('fat-deviations/:deviationId') deviation(@Param('deviationId') deviationId: string, @Body() dto: UpdateManufacturingFatDeviationDto) { return this.service.updateDeviation(deviationId, dto); }
  @Post('fat-executions/:executionId/submit') submit(@Param('executionId') executionId: string, @Body() dto: ManufacturingFatVersionDto) { return this.service.submit(executionId, dto); }
  @Post('fat-executions/:executionId/decision') decision(@Param('executionId') executionId: string, @Body() dto: DecideManufacturingFatDto) { return this.service.decide(executionId, dto); }
}
