import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors, UsePipes, ValidationPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { EngineeringService } from './engineering.service';
import { CreateEngineeringRequestDto, EngineeringActionDto, EngineeringCommentDto, LinkEngineeringOrderDto, SaveProposalDto, UpdateEngineeringRequestDto, EngineeringListDto } from './engineering.dto';
import { MulterFile } from '../../common/multer-file';

const storage = process.env.ATTACHMENTS_DIR || path.resolve('./storage/attachments');
fs.mkdirSync(storage, { recursive: true });

@Controller('engineering-requests')
export class EngineeringController {
  constructor(private readonly service: EngineeringService) {}
  @Get()
  list(@Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) query: EngineeringListDto) { return this.service.list(query); }
  @Get('context')
  context(@Query('workOrderId') order?: string, @Query('noticeId') notice?: string) { return this.service.context(order, notice); }
  @Get(':id')
  detail(@Param('id') id: string) { return this.service.detail(id); }
  @Get(':id/eligible-orders')
  orders(@Param('id') id: string) { return this.service.eligibleOrders(id); }
  @Post()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  create(@Body() dto: CreateEngineeringRequestDto) { return this.service.create(dto); }
  @Patch(':id/proposal')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  proposal(@Param('id') id: string, @Body() dto: SaveProposalDto) { return this.service.proposal(id, dto.version, dto.proposal); }
  @Patch(':id')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  update(@Param('id') id: string, @Body() dto: UpdateEngineeringRequestDto) { return this.service.update(id, dto); }
  @Post(':id/orders/:linkId/unlink')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  unlink(@Param('id') id: string, @Param('linkId') linkId: string, @Body() dto: EngineeringCommentDto) { return this.service.unlinkOrder(id, dto.version, linkId, dto.note); }
  @Post(':id/actions')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  action(@Param('id') id: string, @Body() dto: EngineeringActionDto) { return this.service.action(id, dto); }
  @Post(':id/orders')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  linkOrder(@Param('id') id: string, @Body() dto: LinkEngineeringOrderDto) { return this.service.linkOrder(id, dto.version, dto.workOrderId); }
  @Post(':id/comments')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  comment(@Param('id') id: string, @Body() dto: EngineeringCommentDto) { return this.service.comment(id, dto.version, dto.note); }
  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({ destination: storage, filename: (_req: any, _file: any, cb: (error: Error | null, filename: string) => void) => cb(null, randomUUID()) }),
    limits: { fileSize: 30 * 1024 * 1024 },
  }))
  async upload(@Param('id') id: string, @Body('version') version: string, @UploadedFile() file?: MulterFile) {
    if (!file) throw new BadRequestException('Archivo requerido');
    try { return await this.service.upload(id, Number(version), file); }
    catch (error) { await fs.promises.unlink(file.path).catch(() => {}); throw error; }
  }
}
