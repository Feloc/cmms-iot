import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { MulterFile } from '../../common/multer-file';
import { InventoryImportService } from './inventory.import.service';

const TMP_DIR = process.env.INVENTORY_IMPORT_TMP || path.resolve('./storage/tmp/inventory-imports');
fs.mkdirSync(TMP_DIR, { recursive: true });

@Controller('inventory/import')
export class InventoryImportController {
  constructor(private readonly svc: InventoryImportService) {}

  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req: any, _file: any, cb: any) => cb(null, TMP_DIR),
        filename: (_req: any, file: any, cb: any) => {
          const ext = path.extname(file.originalname) || '';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 30 * 1024 * 1024 },
    }),
  )
  async preview(@UploadedFile() file?: MulterFile) {
    if (!file) throw new BadRequestException('file is required');
    try {
      return await this.svc.preview(file.path);
    } finally {
      try {
        fs.unlinkSync(file.path);
      } catch {}
    }
  }

  @Post('commit')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req: any, _file: any, cb: any) => cb(null, TMP_DIR),
        filename: (_req: any, file: any, cb: any) => {
          const ext = path.extname(file.originalname) || '';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 30 * 1024 * 1024 },
    }),
  )
  async commit(@UploadedFile() file?: MulterFile) {
    if (!file) throw new BadRequestException('file is required');
    try {
      return await this.svc.commit(file.path);
    } finally {
      try {
        fs.unlinkSync(file.path);
      } catch {}
    }
  }
}
