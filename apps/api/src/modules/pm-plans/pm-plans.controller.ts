import { Body, Controller, Get, Post } from '@nestjs/common';
import { PmPlansService } from './pm-plans.service';

@Controller('pm-plans')
export class PmPlansController {
  constructor(private svc: PmPlansService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Post()
  create(@Body() dto: { name: string; intervalHours?: number; checklist?: any }) {
    return this.svc.create(dto);
  }
}
