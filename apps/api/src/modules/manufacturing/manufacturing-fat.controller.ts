import { Res, UseGuards, UsePipes } from '@nestjs/common';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import { FAT_MEDIA_MAX_BYTES, FatMediaFile } from './manufacturing-fat-media';
import { ManufacturingAccessGuard } from './manufacturing-access.guard';
import { ManufacturingValidationPipe } from './manufacturing-validation.pipe';
import { Body, Controller, Get, Param, Post, Patch, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FAT_IMPORT_MAX_BYTES, fatProtocolExample, previewFatProtocol } from './manufacturing-fat-import';
import { ManufacturingFatService } from './manufacturing-fat.service';
import { CreateManufacturingFatDeviationDto } from './dto/manufacturing-fat.dto';
import { CreateManufacturingFatSubpointDto, VoidManufacturingFatSubpointDto } from './dto/manufacturing-fat.dto';
import { CreateManufacturingFatEvidenceDto, CreateManufacturingFatExecutionDto, CreateManufacturingFatTemplateDto, DecideManufacturingFatDto, ManufacturingFatVersionDto, RecordManufacturingFatCaseDto, UpdateManufacturingFatDeviationDto } from './dto/manufacturing-fat.dto';

@UseGuards(ManufacturingAccessGuard)
@UsePipes(ManufacturingValidationPipe)
@Controller('manufacturing')
export class ManufacturingFatController {
  constructor(private readonly service: ManufacturingFatService) {}
  @Get('fat-executions/:executionId/report.pdf')
  async report(@Param('executionId') id: string, @Res({ passthrough: true }) response: Response) {
    const file = await this.service.reportPdf(id);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.buffer, { type: 'application/pdf', length: file.buffer.length, disposition: `attachment; filename="${file.filename}"` });
  }
  @Post('fat-cases/:caseId/subpoints') createSubpoint(@Param('caseId') id: string, @Body() dto: CreateManufacturingFatSubpointDto) { return this.service.createSubpoint(id, dto); }
  @Post('fat-cases/:caseId/void') voidSubpoint(@Param('caseId') id: string, @Body() dto: VoidManufacturingFatSubpointDto) { return this.service.voidSubpoint(id, dto); }
  @Post('fat-cases/:caseId/evidence/file')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: FAT_MEDIA_MAX_BYTES, files: 1, fields: 4, fieldSize: 10000 } }))
  uploadCaseEvidence(@Param('caseId') id: string, @Body() dto: CreateManufacturingFatEvidenceDto, @UploadedFile() file?: FatMediaFile) { return this.service.uploadEvidence(id, dto, file); }
  @Post('fat-deviations/:deviationId/evidence/file')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: FAT_MEDIA_MAX_BYTES, files: 1, fields: 4, fieldSize: 10000 } }))
  uploadFindingEvidence(@Param('deviationId') id: string, @Body() dto: CreateManufacturingFatEvidenceDto, @UploadedFile() file?: FatMediaFile) { return this.service.uploadEvidence(id, dto, file, true); }
  @Get('fat-evidence/:evidenceId/file')
  async downloadEvidence(@Param('evidenceId') id: string, @Res({ passthrough: true }) response: Response) {
    const file = await this.service.evidenceFile(id);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const encodedName = encodeURIComponent(file.filename).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return new StreamableFile(createReadStream(file.path), { type: file.mimeType, length: file.size, disposition: `attachment; filename="evidencia"; filename*=UTF-8''${encodedName}` });
  }
  @Get('fat-templates') templates(@Query('active') active?: string) { return this.service.listTemplates(active); }
  @Post('fat-templates') createTemplate(@Body() dto: CreateManufacturingFatTemplateDto) { return this.service.createTemplate(dto); }
  @Post('fat-templates/import/preview')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: FAT_IMPORT_MAX_BYTES, files: 1, fields: 0 } }))
  previewTemplate(@UploadedFile() file?: { originalname: string; buffer: Buffer }) { return previewFatProtocol(file); }
  @Get('fat-templates/import/example')
  templateExample(@Query('format') format = 'xlsx', @Query('layout') layout = 'flat') {
    return new StreamableFile(fatProtocolExample(format, layout), { type: format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disposition: `attachment; filename="protocolo-fat-${layout}.${format}"` });
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
