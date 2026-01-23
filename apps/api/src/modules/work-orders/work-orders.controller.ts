import { Controller, Get, Param, Patch, Body, Post, Put, Delete } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { AddAssignmentDto, UpdateAssignmentDto } from './dto/assignment.dto';
import { StartWorkDto, PauseWorkDto, StopWorkDto } from './dto/worklog.dto';
import { UpsertResolutionDto } from "./dto/resolution.dto";
import { CreatePartDto, UpdatePartDto } from "./dto/part.dto";
import { CreateMeasurementDto, UpdateMeasurementDto } from "./dto/measurement.dto";
import { CreateNoteDto } from "./dto/note.dto";


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

    // --- Resolución ---
  @Get(':id/resolution')
  getResolution(@Param('id') id: string) {
    return this.service.getResolution(id);
  }
  @Put(':id/resolution')
  upsertResolution(@Param('id') id: string, @Body() dto: UpsertResolutionDto) {
    return this.service.upsertResolution(id, dto);
  }

  // --- Partes ---
  @Get(':id/parts')
  getParts(@Param('id') id: string) {
    return this.service.getParts(id);
  }
  @Post(':id/parts')
  addPart(@Param('id') id: string, @Body() dto: CreatePartDto) {
    return this.service.addPart(id, dto);
  }
  @Patch(':id/parts/:partId')
  updatePart(@Param('id') id: string, @Param('partId') partId: string, @Body() dto: UpdatePartDto) {
    return this.service.updatePart(id, partId, dto);
  }
  @Delete(':id/parts/:partId')
  deletePart(@Param('id') id: string, @Param('partId') partId: string) {
    return this.service.deletePart(id, partId);
  }

  // --- Mediciones ---
  @Get(':id/measurements')
  getMeasurements(@Param('id') id: string) {
    return this.service.getMeasurements(id);
  }
  @Post(':id/measurements')
  addMeasurement(@Param('id') id: string, @Body() dto: CreateMeasurementDto) {
    return this.service.addMeasurement(id, dto);
  }
  @Patch(':id/measurements/:measurementId')
  updateMeasurement(@Param('id') id: string, @Param('measurementId') measurementId: string, @Body() dto: UpdateMeasurementDto) {
    return this.service.updateMeasurement(id, measurementId, dto);
  }
  @Delete(':id/measurements/:measurementId')
  deleteMeasurement(@Param('id') id: string, @Param('measurementId') measurementId: string) {
    return this.service.deleteMeasurement(id, measurementId);
  }

  // --- Adjuntos ---
  /* @Get(':id/attachments')
  getAttachments(@Param('id') id: string) {
    return this.service.getAttachments(id);
  }
  @Post(':id/attachments')
  addAttachment(@Param('id') id: string, @Body() dto: CreateAttachmentDto) {
    return this.service.addAttachment(id, dto);
  }
  @Delete(':id/attachments/:attachmentId')
  deleteAttachment(@Param('id') id: string, @Param('attachmentId') attachmentId: string) {
    return this.service.deleteAttachment(id, attachmentId);
  } */

  // --- Notas ---
  @Get(':id/notes')
  getNotes(@Param('id') id: string) {
    return this.service.getNotes(id);
  }
  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body() dto: CreateNoteDto) {
    return this.service.addNote(id, dto);
  }
  @Delete(':id/notes/:noteId')
  deleteNote(@Param('id') id: string, @Param('noteId') noteId: string) {
    return this.service.deleteNote(id, noteId);
  }

}
