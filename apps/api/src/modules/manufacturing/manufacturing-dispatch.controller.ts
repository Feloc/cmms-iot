import { UseGuards, UsePipes } from '@nestjs/common';
import { ManufacturingAccessGuard } from './manufacturing-access.guard';
import { ManufacturingValidationPipe } from './manufacturing-validation.pipe';
import { Body, Controller, Delete, Get, Param, Patch, Post, Res, StreamableFile, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import { DISPATCH_CHECKLIST_MAX_FILES, DISPATCH_DOCUMENT_MAX_BYTES, DispatchDocumentFile } from './manufacturing-dispatch-files';
import { ManufacturingDispatchService } from './manufacturing-dispatch.service';
import { CancelManufacturingDispatchDto, CreateManufacturingDispatchChecklistEvidenceDto, CreateManufacturingDispatchDocumentDto, CreateManufacturingDispatchDto, CreateManufacturingDispatchPackageDto, DeliverManufacturingDispatchDto, ExecuteManufacturingDispatchDto, ManufacturingDispatchVersionDto, UpdateManufacturingDispatchChecklistDto, UpdateManufacturingDispatchDto } from './dto/manufacturing-dispatch.dto';

@UseGuards(ManufacturingAccessGuard)
@UsePipes(ManufacturingValidationPipe)
@Controller('manufacturing')
export class ManufacturingDispatchController {
  constructor(private readonly service: ManufacturingDispatchService) {}
  @Get('orders/:orderId/dispatches') list(@Param('orderId') orderId: string) { return this.service.list(orderId); }
  @Post('units/:unitId/dispatches') create(@Param('unitId') unitId: string, @Body() dto: CreateManufacturingDispatchDto) { return this.service.create(unitId, dto); }
  @Patch('dispatches/:dispatchId') update(@Param('dispatchId') dispatchId: string, @Body() dto: UpdateManufacturingDispatchDto) { return this.service.update(dispatchId, dto); }
  @Post('dispatches/:dispatchId/start') start(@Param('dispatchId') dispatchId: string, @Body() dto: ManufacturingDispatchVersionDto) { return this.service.start(dispatchId, dto); }
  @Patch('dispatch-checklist/:itemId') checklist(@Param('itemId') itemId: string, @Body() dto: UpdateManufacturingDispatchChecklistDto) { return this.service.updateChecklist(itemId, dto); }
  @Post('dispatch-checklist/:itemId/evidence/file')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: DISPATCH_DOCUMENT_MAX_BYTES, files: 1, fields: 2, fieldSize: 10000 } }))
  uploadChecklistEvidence(@Param('itemId') itemId: string, @Body() dto: CreateManufacturingDispatchChecklistEvidenceDto, @UploadedFile() file?: DispatchDocumentFile) {
    if (file) {
      try { file.originalname = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(file.originalname, 'latin1')); }
      catch { /* Keep filenames submitted with an actual Latin-1 charset. */ }
    }
    return this.service.uploadChecklistEvidence(itemId, dto, file);
  }
  @Post('dispatch-checklist/:itemId/evidence/files')
  @UseInterceptors(FilesInterceptor('files', DISPATCH_CHECKLIST_MAX_FILES, { storage: memoryStorage(), limits: { fileSize: DISPATCH_DOCUMENT_MAX_BYTES, files: DISPATCH_CHECKLIST_MAX_FILES, fields: 2, fieldSize: 10000 } }))
  uploadChecklistEvidenceBatch(@Param('itemId') itemId: string, @Body() dto: CreateManufacturingDispatchChecklistEvidenceDto, @UploadedFiles() files?: DispatchDocumentFile[]) {
    for (const file of files || []) {
      try { file.originalname = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(file.originalname, 'latin1')); }
      catch { /* Keep filenames submitted with an actual Latin-1 charset. */ }
    }
    return this.service.uploadChecklistEvidenceBatch(itemId, dto, files);
  }
  @Get('dispatch-checklist-evidence/:evidenceId/file')
  async downloadChecklistEvidence(@Param('evidenceId') evidenceId: string, @Res({ passthrough: true }) response: Response) {
    const file = await this.service.checklistEvidenceFile(evidenceId);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const encodedName = encodeURIComponent(file.filename).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return new StreamableFile(createReadStream(file.path), { type: file.mimeType, length: file.size, disposition: `attachment; filename="evidencia"; filename*=UTF-8''${encodedName}` });
  }
  @Delete('dispatch-checklist-evidence/:evidenceId') removeChecklistEvidence(@Param('evidenceId') evidenceId: string) { return this.service.removeChecklistEvidence(evidenceId); }
  @Post('dispatches/:dispatchId/packages') addPackage(@Param('dispatchId') dispatchId: string, @Body() dto: CreateManufacturingDispatchPackageDto) { return this.service.addPackage(dispatchId, dto); }
  @Delete('dispatch-packages/:packageId') removePackage(@Param('packageId') packageId: string) { return this.service.removePackage(packageId); }
  @Post('dispatches/:dispatchId/documents') addDocument(@Param('dispatchId') dispatchId: string, @Body() dto: CreateManufacturingDispatchDocumentDto) { return this.service.addDocument(dispatchId, dto); }
  @Post('dispatches/:dispatchId/documents/file')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: DISPATCH_DOCUMENT_MAX_BYTES, files: 1, fields: 5, fieldSize: 10000 } }))
  uploadDocument(@Param('dispatchId') dispatchId: string, @Body() dto: CreateManufacturingDispatchDocumentDto, @UploadedFile() file?: DispatchDocumentFile) {
    // Multipart filenames from browsers arrive as UTF-8 bytes decoded as Latin-1 by Multer.
    if (file) {
      try { file.originalname = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(file.originalname, 'latin1')); }
      catch { /* Keep filenames submitted with an actual Latin-1 charset. */ }
    }
    return this.service.uploadDocument(dispatchId, dto, file);
  }
  @Get('dispatch-documents/:documentId/file')
  async downloadDocument(@Param('documentId') documentId: string, @Res({ passthrough: true }) response: Response) {
    const file = await this.service.documentFile(documentId);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const encodedName = encodeURIComponent(file.filename).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return new StreamableFile(createReadStream(file.path), { type: file.mimeType, length: file.size, disposition: `attachment; filename="documento"; filename*=UTF-8''${encodedName}` });
  }
  @Delete('dispatch-documents/:documentId') removeDocument(@Param('documentId') documentId: string) { return this.service.removeDocument(documentId); }
  @Post('dispatches/:dispatchId/ready') ready(@Param('dispatchId') dispatchId: string, @Body() dto: ManufacturingDispatchVersionDto) { return this.service.markReady(dispatchId, dto); }
  @Post('dispatches/:dispatchId/authorize') authorize(@Param('dispatchId') dispatchId: string, @Body() dto: ManufacturingDispatchVersionDto) { return this.service.authorize(dispatchId, dto); }
  @Post('dispatches/:dispatchId/dispatch') dispatch(@Param('dispatchId') dispatchId: string, @Body() dto: ExecuteManufacturingDispatchDto) { return this.service.dispatch(dispatchId, dto); }
  @Post('dispatches/:dispatchId/deliver') deliver(@Param('dispatchId') dispatchId: string, @Body() dto: DeliverManufacturingDispatchDto) { return this.service.deliver(dispatchId, dto); }
  @Post('dispatches/:dispatchId/cancel') cancel(@Param('dispatchId') dispatchId: string, @Body() dto: CancelManufacturingDispatchDto) { return this.service.cancel(dispatchId, dto); }
  @Post('dispatches/:dispatchId/reopen') reopen(@Param('dispatchId') dispatchId: string, @Body() dto: ManufacturingDispatchVersionDto) { return this.service.reopen(dispatchId, dto); }
}
