import { Controller, Get, Param, Patch, Body, Post } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { AddAssignmentDto, UpdateAssignmentDto } from './dto/assignment.dto';
import { StartWorkDto, PauseWorkDto, StopWorkDto } from './dto/worklog.dto';


@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly service: WorkOrdersService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateWorkOrderDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkOrderDto) {
    return this.service.update(id, dto);
  }

  // --- Assignments ---
  @Post(':id/assignments')
  addAssignment(@Param('id') id: string, @Body() dto: AddAssignmentDto) {
    return this.service.addAssignment(id, dto);
  }

  @Patch(':id/assignments/:assignmentId')
  updateAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.service.updateAssignment(id, assignmentId, dto);
  }

  // --- Work logs ---
  @Post(':id/work/start')
  start(@Param('id') id: string, @Body() dto: StartWorkDto) {
    return this.service.startWork(id, dto);
  }
  @Post(':id/work/pause')
  pause(@Param('id') id: string, @Body() dto: PauseWorkDto) {
    return this.service.pauseWork(id, dto);
  }
  @Post(':id/work/stop')
  stop(@Param('id') id: string, @Body() dto: StopWorkDto) {
    return this.service.stopWork(id, dto);
  }
}
