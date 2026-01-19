import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, Req, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ServiceOrdersService } from './service-orders.service';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import { ScheduleServiceOrderDto } from './dto/schedule-service-order.dto';
import { ServiceOrderTimestampsDto } from './dto/timestamps.dto';
import { ServiceOrderFormDataDto } from './dto/form-data.dto';
import { ServiceOrderSignaturesDto } from './dto/signatures.dto';
import { AddServiceOrderPartDto } from './dto/parts.dto';
import { MarkServiceOrderPartReplacedDto } from './dto/mark-part-replaced.dto';
import { CreateServiceOrderReportDto } from './dto/create-report.dto';
import { ListServiceOrdersQuery } from './dto/list-service-orders.query';
import { ServiceOrdersCalendarQuery } from './dto/calendar.query';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage, diskStorage } from 'multer';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import type { Request } from 'express';
import type { Response } from 'express';

@Controller('service-orders')
export class ServiceOrdersController {
  constructor(private svc: ServiceOrdersService) {}

  @Get('calendar')
  calendar(@Query() q: ServiceOrdersCalendarQuery) {
    return this.svc.calendar(q);
  }

  @Get()
  list(@Query() q: ListServiceOrdersQuery) {
    return this.svc.list(q);
  }

  @Post()
  create(@Body() dto: CreateServiceOrderDto) {
    return this.svc.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateServiceOrderDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/schedule')
  schedule(@Param('id') id: string, @Body() dto: ScheduleServiceOrderDto) {
    return this.svc.schedule(id, dto);
  }

  @Patch(':id/timestamps')
  timestamps(@Param('id') id: string, @Body() dto: ServiceOrderTimestampsDto) {
    return this.svc.setTimestamps(id, dto);
  }

  @Patch(':id/form')
  form(@Param('id') id: string, @Body() dto: ServiceOrderFormDataDto) {
    return this.svc.setFormData(id, dto);
  }

  @Patch(':id/signatures')
  signatures(@Param('id') id: string, @Body() dto: ServiceOrderSignaturesDto) {
    return this.svc.setSignatures(id, dto);
  }

  @Post(':id/parts')
  addPart(@Param('id') id: string, @Body() dto: AddServiceOrderPartDto) {
    return this.svc.addPart(id, dto);
  }

  @Delete(':id/parts/:partId')
  removePart(@Param('id') id: string, @Param('partId') partId: string) {
    return this.svc.removePart(id, partId);
  }

  // Marca un repuesto "necesario" como "cambiado" (manejo pro de cantidades)
  @Patch(':id/parts/:partId/mark-replaced')
  markPartReplaced(
    @Param('id') id: string,
    @Param('partId') partId: string,
    @Body() dto: MarkServiceOrderPartReplacedDto,
  ) {
    return this.svc.markPartReplaced(id, partId, dto);
  }

  // ---------------------------
  // Reportes / Resumen de OS (versionado)
  // ---------------------------
  @Get(':id/reports')
  listReports(@Param('id') id: string) {
    return this.svc.listReports(id);
  }

  @Post(':id/reports')
  createReport(@Param('id') id: string, @Body() dto: CreateServiceOrderReportDto) {
    return this.svc.createReport(id, dto);
  }

  @Get(':id/reports/:reportId')
  getReport(@Param('id') id: string, @Param('reportId') reportId: string) {
    return this.svc.getReport(id, reportId);
  }

@Get(':id/images')
listImages(@Param('id') id: string) {
  return this.svc.listImages(id);
}

@Post(':id/images')
@UseInterceptors(
  FilesInterceptor('files', 10, {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, !!file?.mimetype?.startsWith('image/')),
  }),
)
uploadImages(@Param('id') id: string, @UploadedFiles() files: any[]) {
  return this.svc.uploadImages(id, files ?? []);
}

@Get(':id/images/:filename')
async getImage(@Param('id') id: string, @Param('filename') filename: string, @Res() res: Response) {
  const p = await this.svc.getImagePath(id, filename);
  return res.sendFile(p);
}

@Delete(':id/images/:filename')
deleteImage(@Param('id') id: string, @Param('filename') filename: string) {
  return this.svc.deleteImage(id, filename);
}

// ---------------------------
// Adjuntos (nuevo): IMAGE | VIDEO | DOCUMENT
// ---------------------------
@Get(':id/attachments')
listAttachments(@Param('id') id: string, @Query('type') type?: string) {
  return this.svc.listAttachments(id, type ?? 'IMAGE');
}

@Post(':id/attachments')
@UseInterceptors(
  FilesInterceptor('files', 10, {
    // diskStorage evita cargar archivos grandes (videos) en memoria RAM
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(process.cwd(), 'uploads', 'tmp');
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const extRaw = path.extname(String(file?.originalname || '')).toLowerCase();
        const ext = extRaw && extRaw.length <= 10 ? extRaw : '';
        cb(null, `${Date.now()}-${randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB (ajusta según tu caso)
    // Validación fina se hace en el service según "type"
    fileFilter: (_req, file, cb) => cb(null, !!file),
  }),
)
uploadAttachments(@Param('id') id: string, @Query('type') type: string, @UploadedFiles() files: any[]) {
  return this.svc.uploadAttachments(id, type ?? 'IMAGE', files ?? []);
}

@Get(':id/attachments/:type/:filename')
async getAttachment(
  @Param('id') id: string,
  @Param('type') type: string,
  @Param('filename') filename: string,
  @Req() req: Request,
  @Res() res: Response,
) {
  const p = await this.svc.getAttachmentPath(id, type, filename);

  // Para VIDEO soportamos Range (streaming parcial) para que el navegador pueda hacer seek.
  if (String(type).toUpperCase() === 'VIDEO') {
    const st = await stat(p);
    const fileSize = st.size;
    const range = (req.headers as any)?.range as string | undefined;

    res.setHeader('Accept-Ranges', 'bytes');
    res.type(p);

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = Math.max(0, parseInt(parts[0] || '0', 10) || 0);
      const end = parts[1] ? Math.min(fileSize - 1, parseInt(parts[1], 10) || fileSize - 1) : fileSize - 1;

      if (start >= fileSize) {
        res.status(416);
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', String(chunkSize));

      return createReadStream(p, { start, end }).pipe(res);
    }

    res.status(200);
    res.setHeader('Content-Length', String(fileSize));
    return createReadStream(p).pipe(res);
  }

  return res.sendFile(p);
}

@Delete(':id/attachments/:type/:filename')
deleteAttachment(@Param('id') id: string, @Param('type') type: string, @Param('filename') filename: string) {
  return this.svc.deleteAttachment(id, type, filename);
}

}
