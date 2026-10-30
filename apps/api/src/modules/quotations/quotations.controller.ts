import { Body, Controller, Get, Header, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors, ValidationPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { QuotationsService } from './quotations.service';
import { AccessDto, ActionDto, CreateQuotationDto, DocumentDto, EditLinesDto, LinkDto, ListDto, OfferDto, UploadDto, VersionDto } from './quotations.dto';
const validation = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly service: QuotationsService) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(@Query(validation) query: ListDto) { return this.service.list(query); }
  @Get('metadata') @Header('Cache-Control', 'private, no-store') metadata() { return this.service.metadata(); }
  @Get('catalog') @Header('Cache-Control', 'private, no-store') catalog(@Query('kind') kind: string, @Query('q') q?: string) { return this.service.references(null, kind, q); }
  @Post('access') access(@Body(validation) dto: AccessDto) { return this.service.access(dto); }
  @Post() create(@Body(validation) dto: CreateQuotationDto) { return this.service.create(dto); }
  @Get(':id') @Header('Cache-Control', 'private, no-store') detail(@Param('id') id: string) { return this.service.detail(id); }
  @Get(':id/events') @Header('Cache-Control', 'private, no-store') events(@Param('id') id: string, @Query('page') page?: string) { return this.service.events(id, Math.min(100000, Math.max(1, Math.trunc(Number(page)) || 1))); }
  @Get(':id/references') @Header('Cache-Control', 'private, no-store') references(@Param('id') id: string, @Query('kind') kind: string, @Query('q') q?: string) { return this.service.references(id, kind, q); }
  @Patch(':id/lines') lines(@Param('id') id: string, @Body(validation) dto: EditLinesDto) { return this.service.editLines(id, dto); }
  @Post(':id/actions') action(@Param('id') id: string, @Body(validation) dto: ActionDto) { return this.service.action(id, dto); }
  @Post(':id/offers') offer(@Param('id') id: string, @Body(validation) dto: OfferDto) { return this.service.offer(id, dto); }
  @Post(':id/offers/:offerId/select') select(@Param('id') id: string, @Param('offerId') offerId: string, @Body(validation) dto: VersionDto) { return this.service.selectOffer(id, offerId, dto.version); }
  @Post(':id/documents') document(@Param('id') id: string, @Body(validation) dto: DocumentDto) { return this.service.document(id, dto); }
  @Post(':id/links') link(@Param('id') id: string, @Body(validation) dto: LinkDto) { return this.service.link(id, dto); }
  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 3 } }))
  upload(@Param('id') id: string, @Body(validation) dto: UploadDto, @UploadedFile() file?: { buffer: Buffer; originalname: string; size: number }) { return this.service.upload(id, dto, file); }
  @Get(':id/attachments/:fileId/download')
  async download(@Param('id') id: string, @Param('fileId') fileId: string, @Res() res: Response) {
    const file = await this.service.file(id, fileId);
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(file.mimeType).download(file.path, file.filename);
  }
}
