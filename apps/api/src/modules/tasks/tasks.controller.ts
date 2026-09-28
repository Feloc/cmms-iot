import { BadRequestException, Body, Controller, Get, Header, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors, UsePipes, ValidationPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Response } from 'express';
import { TasksService } from './tasks.service';
import { DependencyDto, EditTaskDto, TaskActionDto, TaskInputDto, TaskListDto, TaskUpdateDto, TaskReferenceDto, VersionDto } from './tasks.dto';
import { MulterFile } from '../../common/multer-file';
// Separate storage and download routes prevent legacy attachment endpoints from bypassing task ACLs.
const storage = path.join(process.env.ATTACHMENTS_DIR || path.resolve('./storage/attachments'), 'tasks');
const validation = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(@Query(validation) query: TaskListDto) { return this.service.list(query); }
  @Get('references') @Header('Cache-Control', 'private, no-store') references(@Query(validation) query: TaskReferenceDto) { return this.service.references(query.type, query.q); }
  @Get(':id') @Header('Cache-Control', 'private, no-store') detail(@Param('id') id: string) { return this.service.detail(id); }
  @Post() @UsePipes(validation) create(@Body() dto: TaskInputDto) { return this.service.create(dto); }
  @Patch(':id') @UsePipes(validation) edit(@Param('id') id: string, @Body() dto: EditTaskDto) { return this.service.edit(id, dto); }
  @Post(':id/actions') @UsePipes(validation) action(@Param('id') id: string, @Body() dto: TaskActionDto) { return this.service.action(id, dto); }
  @Post(':id/updates') @UsePipes(validation) update(@Param('id') id: string, @Body() dto: TaskUpdateDto) { return this.service.update(id, dto); }
  @Post(':id/dependencies') @UsePipes(validation) depend(@Param('id') id: string, @Body() dto: DependencyDto) { return this.service.addDependency(id, dto); }
  @Post(':id/dependencies/:dependencyId/remove') @UsePipes(validation) remove(@Param('id') id: string, @Param('dependencyId') dependencyId: string, @Body() dto: VersionDto) { return this.service.removeDependency(id, dependencyId, dto.version); }
  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({
    destination: (_req: any, _file: any, cb: any) => { fs.mkdirSync(storage, { recursive: true }); cb(null, storage); },
    filename: (_req: any, _file: any, cb: any) => cb(null, randomUUID()),
  }), limits: { fileSize: 30 * 1024 * 1024, files: 1, fields: 2 } }))
  async upload(@Param('id') id: string, @Body('version') version: string, @Body('updateId') updateId: string | undefined, @UploadedFile() file?: MulterFile) {
    if (!file) throw new BadRequestException('Archivo requerido');
    try { return await this.service.attach(id, Number(version), updateId, { ...file, filename: file.filename! }); }
    catch (error) { await fs.promises.unlink(file.path).catch(() => {}); throw error; }
  }
  @Get(':id/attachments/:fileId/download')
  async download(@Param('id') id: string, @Param('fileId') fileId: string, @Res() res: Response) {
    const file = await this.service.file(id, fileId);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.download(path.join(storage, file.storageKey), file.filename);
  }
}
