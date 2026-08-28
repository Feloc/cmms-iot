import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ManufacturingDispatchService } from './manufacturing-dispatch.service';
import { CancelManufacturingDispatchDto, CreateManufacturingDispatchDocumentDto, CreateManufacturingDispatchDto, CreateManufacturingDispatchPackageDto, DeliverManufacturingDispatchDto, ExecuteManufacturingDispatchDto, ManufacturingDispatchVersionDto, UpdateManufacturingDispatchChecklistDto, UpdateManufacturingDispatchDto } from './dto/manufacturing-dispatch.dto';

@Controller('manufacturing')
export class ManufacturingDispatchController {
  constructor(private readonly service: ManufacturingDispatchService) {}
  @Get('orders/:orderId/dispatches') list(@Param('orderId') orderId: string) { return this.service.list(orderId); }
  @Post('units/:unitId/dispatches') create(@Param('unitId') unitId: string, @Body() dto: CreateManufacturingDispatchDto) { return this.service.create(unitId, dto); }
  @Patch('dispatches/:dispatchId') update(@Param('dispatchId') dispatchId: string, @Body() dto: UpdateManufacturingDispatchDto) { return this.service.update(dispatchId, dto); }
  @Post('dispatches/:dispatchId/start') start(@Param('dispatchId') dispatchId: string, @Body() dto: ManufacturingDispatchVersionDto) { return this.service.start(dispatchId, dto); }
  @Patch('dispatch-checklist/:itemId') checklist(@Param('itemId') itemId: string, @Body() dto: UpdateManufacturingDispatchChecklistDto) { return this.service.updateChecklist(itemId, dto); }
  @Post('dispatches/:dispatchId/packages') addPackage(@Param('dispatchId') dispatchId: string, @Body() dto: CreateManufacturingDispatchPackageDto) { return this.service.addPackage(dispatchId, dto); }
  @Delete('dispatch-packages/:packageId') removePackage(@Param('packageId') packageId: string) { return this.service.removePackage(packageId); }
  @Post('dispatches/:dispatchId/documents') addDocument(@Param('dispatchId') dispatchId: string, @Body() dto: CreateManufacturingDispatchDocumentDto) { return this.service.addDocument(dispatchId, dto); }
  @Delete('dispatch-documents/:documentId') removeDocument(@Param('documentId') documentId: string) { return this.service.removeDocument(documentId); }
  @Post('dispatches/:dispatchId/ready') ready(@Param('dispatchId') dispatchId: string, @Body() dto: ManufacturingDispatchVersionDto) { return this.service.markReady(dispatchId, dto); }
  @Post('dispatches/:dispatchId/authorize') authorize(@Param('dispatchId') dispatchId: string, @Body() dto: ManufacturingDispatchVersionDto) { return this.service.authorize(dispatchId, dto); }
  @Post('dispatches/:dispatchId/dispatch') dispatch(@Param('dispatchId') dispatchId: string, @Body() dto: ExecuteManufacturingDispatchDto) { return this.service.dispatch(dispatchId, dto); }
  @Post('dispatches/:dispatchId/deliver') deliver(@Param('dispatchId') dispatchId: string, @Body() dto: DeliverManufacturingDispatchDto) { return this.service.deliver(dispatchId, dto); }
  @Post('dispatches/:dispatchId/cancel') cancel(@Param('dispatchId') dispatchId: string, @Body() dto: CancelManufacturingDispatchDto) { return this.service.cancel(dispatchId, dto); }
  @Post('dispatches/:dispatchId/reopen') reopen(@Param('dispatchId') dispatchId: string, @Body() dto: ManufacturingDispatchVersionDto) { return this.service.reopen(dispatchId, dto); }
}
