import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { NoticesService } from './notices.service';
import { CreateNoticeDto, UpdateNoticeDto } from './dto/notice.dto';

@Controller('notices')
export class NoticesController {
  constructor(private readonly service: NoticesService) {}

  @Get()
  findAll(@Query('status') status?: string, @Query('asset') assetCode?: string) {
    return this.service.findAll({ status, assetCode });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateNoticeDto) {
    // source por defecto MANUAL si no viene
    if (!dto.source) (dto as any).source = 'MANUAL';
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNoticeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/work-orders')
  createWorkOrderFromNotice(
    @Param('id') id: string,
    @Body() body: { title?: string; description?: string; priority?: 'LOW'|'MEDIUM'|'HIGH'|'URGENT'; dueDate?: string; assignedToUserIds?: string[] }
  ) {
    return this.service.createWorkOrderFromNotice(id, body);
  }
}

