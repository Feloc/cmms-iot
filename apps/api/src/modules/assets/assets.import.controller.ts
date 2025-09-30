import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { AssetsImportService } from './assets.import.service';

const TMP_DIR = process.env.ASSETS_IMPORT_TMP || path.resolve('./storage/tmp/assets-imports');
fs.mkdirSync(TMP_DIR, { recursive: true });

@Controller('assets/import')
export class AssetsImportController {
  constructor(private readonly svc: AssetsImportService) {}

  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, TMP_DIR),
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname) || '';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 30 * 1024 * 1024 },
    })
  )
  async preview(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    return this.svc.handlePreview(file);
  }

  @Post('commit')
  async commit(@Body() body: { uploadId?: string; options?: Record<string, any> }) {
    if (!body?.uploadId) throw new BadRequestException('uploadId is required');
    return this.svc.handleCommit(body.uploadId, body.options || {});
  }
}
