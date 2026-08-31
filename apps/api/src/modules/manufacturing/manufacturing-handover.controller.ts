import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ManufacturingHandoverService } from './manufacturing-handover.service';
import {
  AcceptManufacturingHandoverDto,
  CreateManufacturingHandoverDto,
  CreateManufacturingHandoverSpareDto,
  CreateManufacturingHandoverTrainingDto,
  ManufacturingHandoverVersionDto,
  UpdateManufacturingHandoverDocumentDto,
} from './dto/manufacturing-handover.dto';

@Controller('manufacturing')
export class ManufacturingHandoverController {
  constructor(private readonly service: ManufacturingHandoverService) {}

  @Get('orders/:orderId/handovers') list(@Param('orderId') orderId: string) { return this.service.list(orderId); }
  @Post('units/:unitId/handovers') create(@Param('unitId') unitId: string, @Body() dto: CreateManufacturingHandoverDto) { return this.service.create(unitId, dto); }
  @Patch('handover-documents/:documentId') document(@Param('documentId') documentId: string, @Body() dto: UpdateManufacturingHandoverDocumentDto) { return this.service.updateDocument(documentId, dto); }
  @Post('handovers/:handoverId/trainings') training(@Param('handoverId') handoverId: string, @Body() dto: CreateManufacturingHandoverTrainingDto) { return this.service.addTraining(handoverId, dto); }
  @Delete('handover-trainings/:trainingId') removeTraining(@Param('trainingId') trainingId: string) { return this.service.removeTraining(trainingId); }
  @Post('handovers/:handoverId/spares') spare(@Param('handoverId') handoverId: string, @Body() dto: CreateManufacturingHandoverSpareDto) { return this.service.addSpare(handoverId, dto); }
  @Delete('handover-spares/:spareId') removeSpare(@Param('spareId') spareId: string) { return this.service.removeSpare(spareId); }
  @Post('handovers/:handoverId/ready') ready(@Param('handoverId') handoverId: string, @Body() dto: ManufacturingHandoverVersionDto) { return this.service.markReady(handoverId, dto); }
  @Post('handovers/:handoverId/acceptance') acceptance(@Param('handoverId') handoverId: string, @Body() dto: AcceptManufacturingHandoverDto) { return this.service.accept(handoverId, dto); }
}
