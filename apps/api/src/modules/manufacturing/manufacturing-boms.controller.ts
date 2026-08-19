import { BadRequestException, Body, Controller, Get, Param, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { MulterFile } from '../../common/multer-file';
import { ManufacturingBomsService } from './manufacturing-boms.service';
import { ManufacturingBomImportService } from './manufacturing-bom-import.service';
import { CommitManufacturingBomImportDto, CreateManufacturingBomDto, CreateManufacturingBomRevisionDto, ReplaceManufacturingBomLinesDto, ReviewManufacturingBomRevisionDto } from './dto/manufacturing-bom.dto';

const TMP_DIR = process.env.MANUFACTURING_IMPORT_TMP || path.resolve('./storage/tmp/manufacturing-bom-imports');
fs.mkdirSync(TMP_DIR, { recursive: true });

@Controller('manufacturing')
export class ManufacturingBomsController {
  constructor(private readonly service: ManufacturingBomsService, private readonly imports: ManufacturingBomImportService) {}

  @Get('orders/:orderId/boms') list(@Param('orderId') orderId: string) { return this.service.list(orderId); }
  @Post('orders/:orderId/boms') create(@Param('orderId') orderId: string, @Body() dto: CreateManufacturingBomDto) { return this.service.create(orderId, dto); }
  @Post('boms/:bomId/revisions') createRevision(@Param('bomId') bomId: string, @Body() dto: CreateManufacturingBomRevisionDto) { return this.service.createRevision(bomId, dto); }
  @Get('bom-revisions/:revisionId') detail(@Param('revisionId') revisionId: string) { return this.service.getRevision(revisionId); }
  @Put('bom-revisions/:revisionId/lines') replaceLines(@Param('revisionId') revisionId: string, @Body() dto: ReplaceManufacturingBomLinesDto) { return this.service.replaceLines(revisionId, dto); }

  @Post('bom-revisions/:revisionId/import/preview')
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: (_req: any, _file: any, cb: any) => cb(null, TMP_DIR), filename: (_req: any, file: any, cb: any) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`) }), limits: { fileSize: 30 * 1024 * 1024 } }))
  async preview(@Param('revisionId') revisionId: string, @UploadedFile() file?: MulterFile) {
    if (!file) throw new BadRequestException('El archivo es obligatorio');
    if (!['.csv', '.xls', '.xlsx'].includes(path.extname(file.originalname).toLowerCase())) { try { fs.unlinkSync(file.path); } catch {} throw new BadRequestException('Solo se permiten archivos CSV, XLS o XLSX'); }
    try { return await this.imports.preview(revisionId, file); } finally { try { fs.unlinkSync(file.path); } catch {} }
  }

  @Post('bom-revisions/:revisionId/import/commit') commit(@Param('revisionId') revisionId: string, @Body() dto: CommitManufacturingBomImportDto) { return this.imports.commit(revisionId, dto?.uploadToken); }
  @Post('bom-revisions/:revisionId/submit') submit(@Param('revisionId') revisionId: string) { return this.service.submit(revisionId); }
  @Post('bom-revisions/:revisionId/approve') approve(@Param('revisionId') revisionId: string, @Body() dto: ReviewManufacturingBomRevisionDto) { return this.service.review(revisionId, true, dto); }
  @Post('bom-revisions/:revisionId/reject') reject(@Param('revisionId') revisionId: string, @Body() dto: ReviewManufacturingBomRevisionDto) { return this.service.review(revisionId, false, dto); }
}
