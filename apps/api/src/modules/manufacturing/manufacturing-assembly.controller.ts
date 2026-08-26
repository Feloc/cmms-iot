import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ManufacturingAssemblyService } from './manufacturing-assembly.service';
import { CreateManufacturingAssemblyConsumptionDto, CreateManufacturingAssemblyEvidenceDto, CreateManufacturingAssemblyExecutionDto, ManufacturingAssemblyOperationActionDto, StartManufacturingAssemblyTimeDto, StopManufacturingAssemblyTimeDto, UpdateManufacturingAssemblyOperationDto } from './dto/manufacturing-assembly.dto';

@Controller('manufacturing')
export class ManufacturingAssemblyController {
  constructor(private readonly service: ManufacturingAssemblyService) {}
  @Get('orders/:orderId/assembly-executions') list(@Param('orderId') orderId: string) { return this.service.list(orderId); }
  @Post('kits/:kitId/assembly-executions') create(@Param('kitId') kitId: string, @Body() dto: CreateManufacturingAssemblyExecutionDto) { return this.service.create(kitId, dto); }
  @Patch('assembly-operations/:operationId') update(@Param('operationId') operationId: string, @Body() dto: UpdateManufacturingAssemblyOperationDto) { return this.service.updateOperation(operationId, dto); }
  @Post('assembly-operations/:operationId/time/start') startTime(@Param('operationId') operationId: string, @Body() dto: StartManufacturingAssemblyTimeDto) { return this.service.startTime(operationId, dto); }
  @Post('assembly-time-logs/:logId/stop') stopTime(@Param('logId') logId: string, @Body() dto: StopManufacturingAssemblyTimeDto) { return this.service.stopTime(logId, dto); }
  @Post('assembly-operations/:operationId/evidence') evidence(@Param('operationId') operationId: string, @Body() dto: CreateManufacturingAssemblyEvidenceDto) { return this.service.addEvidence(operationId, dto); }
  @Post('assembly-operations/:operationId/consumptions') consumption(@Param('operationId') operationId: string, @Body() dto: CreateManufacturingAssemblyConsumptionDto) { return this.service.addConsumption(operationId, dto); }
  @Post('assembly-operations/:operationId/:action') action(@Param('operationId') operationId: string, @Param('action') action: string, @Body() dto: ManufacturingAssemblyOperationActionDto) { return this.service.operationAction(operationId, action, dto); }
}
