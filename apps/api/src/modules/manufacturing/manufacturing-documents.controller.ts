import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { MulterFile } from '../../common/multer-file';
import {
  CreateEngineeringDocumentDto,
  CreateEngineeringRevisionDto,
  ReviewEngineeringRevisionDto,
  UpdateEngineeringDocumentDto,
} from './dto/engineering-documents.dto';
import { ManufacturingDocumentsService } from './manufacturing-documents.service';

const STORAGE_DIR = process.env.ATTACHMENTS_DIR || path.resolve('./storage/attachments');
fs.mkdirSync(STORAGE_DIR, { recursive: true });

@Controller('manufacturing')
export class ManufacturingDocumentsController {
  constructor(private readonly service: ManufacturingDocumentsService) {}

  @Get('orders/:orderId/documents')
  list(@Param('orderId') orderId: string) {
    return this.service.list(orderId);
  }

  @Post('orders/:orderId/documents')
  create(@Param('orderId') orderId: string, @Body() dto: CreateEngineeringDocumentDto) {
    return this.service.create(orderId, dto);
  }

  @Patch('documents/:documentId')
  update(@Param('documentId') documentId: string, @Body() dto: UpdateEngineeringDocumentDto) {
    return this.service.update(documentId, dto);
  }

  @Post('documents/:documentId/revisions')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_request: any, _file: any, callback: any) => callback(null, STORAGE_DIR),
      filename: (_request: any, file: any, callback: any) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: Number(process.env.ATTACHMENTS_MAX_MB || 30) * 1024 * 1024 },
  }))
  createRevision(
    @Param('documentId') documentId: string,
    @UploadedFile() file: MulterFile | undefined,
    @Body() dto: CreateEngineeringRevisionDto,
  ) {
    if (!file) throw new BadRequestException('El archivo es obligatorio');
    return this.service.createRevision(documentId, dto, file);
  }

  @Post('document-revisions/:revisionId/submit')
  submit(@Param('revisionId') revisionId: string) {
    return this.service.submit(revisionId);
  }

  @Post('document-revisions/:revisionId/approve')
  approve(@Param('revisionId') revisionId: string, @Body() dto: ReviewEngineeringRevisionDto) {
    return this.service.review(revisionId, true, dto);
  }

  @Post('document-revisions/:revisionId/reject')
  reject(@Param('revisionId') revisionId: string, @Body() dto: ReviewEngineeringRevisionDto) {
    return this.service.review(revisionId, false, dto);
  }
}
