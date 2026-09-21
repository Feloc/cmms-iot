import { Controller, Get, Param, Query } from '@nestjs/common';
import { ManufacturingControlService } from './manufacturing-control.service';

@Controller('manufacturing')
export class ManufacturingControlController {
  constructor(private readonly control: ManufacturingControlService) {}
  @Get('control') list(@Query('page') page?: string, @Query('q') q?: string, @Query('closed') closed?: string) { return this.control.list({ page, q, closed }); }
  @Get('orders/:id/control') get(@Param('id') id: string) { return this.control.get(id); }
}
