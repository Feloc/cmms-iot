import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ManufacturingSupplyService } from './manufacturing-supply.service';
import { ActOnManufacturingStockReservationDto, CancelManufacturingSupplyRequestDto, CreateManufacturingStockReservationDto, CreateManufacturingSupplyRequestDto, DeliverManufacturingSupplyRequestDto, GenerateManufacturingSupplyPlanDto, UpdateManufacturingSupplyRequestDto, UpdateManufacturingSupplyRequirementDto } from './dto/manufacturing-supply.dto';
import { ManufacturingStockReservationsService } from './manufacturing-stock-reservations.service';
import { ManufacturingSupplyRequestsService } from './manufacturing-supply-requests.service';

@Controller('manufacturing')
export class ManufacturingSupplyController {
  constructor(private readonly service: ManufacturingSupplyService, private readonly reservations: ManufacturingStockReservationsService, private readonly requests: ManufacturingSupplyRequestsService) {}

  @Get('orders/:orderId/supply-plans') list(@Param('orderId') orderId: string) { return this.service.list(orderId); }
  @Post('orders/:orderId/supply-plans/generate') generate(@Param('orderId') orderId: string, @Body() dto: GenerateManufacturingSupplyPlanDto) { return this.service.generate(orderId, dto); }
  @Patch('supply-requirements/:requirementId') updateRequirement(@Param('requirementId') requirementId: string, @Body() dto: UpdateManufacturingSupplyRequirementDto) { return this.service.updateRequirement(requirementId, dto); }
  @Post('supply-requirements/:requirementId/stock-reservations') reserve(@Param('requirementId') requirementId: string, @Body() dto: CreateManufacturingStockReservationDto) { return this.reservations.reserve(requirementId, dto); }
  @Post('stock-reservations/:reservationId/issue') issue(@Param('reservationId') reservationId: string, @Body() dto: ActOnManufacturingStockReservationDto) { return this.reservations.issue(reservationId, dto); }
  @Post('stock-reservations/:reservationId/release') release(@Param('reservationId') reservationId: string, @Body() dto: ActOnManufacturingStockReservationDto) { return this.reservations.release(reservationId, dto); }
  @Post('supply-requirements/:requirementId/requests') createRequest(@Param('requirementId') requirementId: string, @Body() dto: CreateManufacturingSupplyRequestDto) { return this.requests.create(requirementId, dto); }
  @Patch('supply-requests/:requestId') updateRequest(@Param('requestId') requestId: string, @Body() dto: UpdateManufacturingSupplyRequestDto) { return this.requests.update(requestId, dto); }
  @Post('supply-requests/:requestId/deliveries') deliverRequest(@Param('requestId') requestId: string, @Body() dto: DeliverManufacturingSupplyRequestDto) { return this.requests.deliver(requestId, dto); }
  @Post('supply-requests/:requestId/cancel') cancelRequest(@Param('requestId') requestId: string, @Body() dto: CancelManufacturingSupplyRequestDto) { return this.requests.cancel(requestId, dto); }
}
