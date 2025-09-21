import { Controller, Post, Get, Delete, Param, UseInterceptors, UploadedFile, Body, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AttachmentsService } from './attachments.service';
import { AttachmentTypeDto } from './dto/create-attachment.dto';

function getTenantAndUser(req: Request) {
  const user = (req as any).user || {};
  const tenantId = user.tenantId || (req.headers['x-tenant-id'] as string);
  const userId = user.sub || user.id || (req.headers['x-user-id'] as string);
  if (!tenantId) throw new Error('tenantId no detectado en request');
  if (!userId) throw new Error('userId no detectado en request');
  return { tenantId, userId };
}

@Controller('work-orders/:workOrderId/attachments')
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('workOrderId') workOrderId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: AttachmentTypeDto,
    @Req() req: Request,
  ) {
    const { tenantId, userId } = getTenantAndUser(req);
    return this.service.uploadMultipart({
      tenantId,
      workOrderId,
      userId,
      file,
      type: type || (file?.mimetype?.startsWith('image') ? 'IMAGE' : 'DOCUMENT'),
    } as any);
  }

  @Get()
  async list(@Param('workOrderId') workOrderId: string, @Req() req: Request) {
    const { tenantId } = getTenantAndUser(req);
    return this.service.list(tenantId, workOrderId);
  }

  @Delete(':id')
  async remove(@Param('workOrderId') workOrderId: string, @Param('id') id: string, @Req() req: Request) {
    const { tenantId } = getTenantAndUser(req);
    return this.service.remove(tenantId, id);
  }
}
