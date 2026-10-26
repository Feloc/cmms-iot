import { Body, Controller, Get, Header, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors, ValidationPipe, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { ToolsService } from './tools.service';
import { CreateToolDto, EditToolDto, ImportToolsDto, LendToolDto, ReceiveToolsDto, ReturnToolDto, ToolConditionDto, ToolListDto, ToolEventsDto } from './tools.dto';

const validation = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
@Controller('tools')
export class ToolsController {
  constructor(private readonly service: ToolsService) {}
  @Get() @Header('Cache-Control', 'private, no-store') list(@Query(validation) query: ToolListDto) { return this.service.list(query); }
  @Post('import/preview') preview(@Body(validation) dto: ImportToolsDto) { return this.service.previewImport(dto.csv); }
  @Post('import/commit') import(@Body(validation) dto: ImportToolsDto) { return this.service.commitImport(dto.csv); }
  @Post() create(@Body(validation) dto: CreateToolDto) { return this.service.create(dto); }
  @Get(':id') @Header('Cache-Control', 'private, no-store') detail(@Param('id') id: string) { return this.service.detail(id); }
  @Get(':id/events') @Header('Cache-Control', 'private, no-store') events(@Param('id') id: string, @Query(validation) query: ToolEventsDto) { return this.service.events(id, query.page); }
  @Patch(':id') edit(@Param('id') id: string, @Body(validation) dto: EditToolDto) { return this.service.edit(id, dto); }
  @Post(':id/loans') lend(@Param('id') id: string, @Body(validation) dto: LendToolDto) { return this.service.lend(id, dto); }
  @Post(':id/loans/:loanId/return') returnLoan(@Param('id') id: string, @Param('loanId') loanId: string, @Body(validation) dto: ReturnToolDto) { return this.service.returnLoan(id, loanId, dto); }
  @Post(':id/condition') condition(@Param('id') id: string, @Body(validation) dto: ToolConditionDto) { return this.service.condition(id, dto); }
  @Post(':id/receipts') receive(@Param('id') id: string, @Body(validation) dto: ReceiveToolsDto) { return this.service.receive(id, dto); }
  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 } }))
  photo(@Param('id') id: string, @Body('version') version: string, @UploadedFile() file?: { buffer: Buffer }) {
    if (!/^[1-9]\d*$/.test(version || '') || !Number.isSafeInteger(Number(version))) throw new BadRequestException('Versión inválida');
    return this.service.setPhoto(id, Number(version), file);
  }
  @Get(':id/photo')
  async downloadPhoto(@Param('id') id: string, @Res() res: Response) {
    const photo = await this.service.photo(id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(photo.mimeType).send(Buffer.from(photo.data));
  }
}
