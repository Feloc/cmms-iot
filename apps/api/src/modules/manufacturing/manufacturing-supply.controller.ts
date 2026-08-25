import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ManufacturingSupplyService } from './manufacturing-supply.service';
import { ActOnManufacturingStockReservationDto, AdjustManufacturingKitLineDto, CancelManufacturingKitDto, CancelManufacturingSupplyRequestDto, CreateManufacturingStockReservationDto, CreateManufacturingSupplyRequestDto, DeliverManufacturingSupplyRequestDto, GenerateManufacturingSupplyPlanDto, InspectManufacturingSupplyDeliveryDto, ReleaseManufacturingKitDto, ResolveManufacturingQuarantineDto, UpdateManufacturingSupplyRequestDto, UpdateManufacturingSupplyRequirementDto, WaiveManufacturingKitLineDto } from './dto/manufacturing-supply.dto';
import { ManufacturingStockReservationsService } from './manufacturing-stock-reservations.service';
import { ManufacturingSupplyRequestsService } from './manufacturing-supply-requests.service';
import { ManufacturingSupplyInspectionsService } from './manufacturing-supply-inspections.service';
import { ManufacturingKitsService } from './manufacturing-kits.service';

@Controller('manufacturing')
export class ManufacturingSupplyController {
  constructor(private readonly service: ManufacturingSupplyService, private readonly reservations: ManufacturingStockReservationsService, private readonly requests: ManufacturingSupplyRequestsService, private readonly inspections: ManufacturingSupplyInspectionsService, private readonly kits: ManufacturingKitsService) {}

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
  @Post('supply-deliveries/:deliveryId/inspect') inspectDelivery(@Param('deliveryId') deliveryId: string, @Body() dto: InspectManufacturingSupplyDeliveryDto) { return this.inspections.inspect(deliveryId, dto); }
  @Post('supply-deliveries/:deliveryId/resolve-quarantine') resolveQuarantine(@Param('deliveryId') deliveryId: string, @Body() dto: ResolveManufacturingQuarantineDto) { return this.inspections.resolveQuarantine(deliveryId, dto); }
  @Get('orders/:orderId/kits') listKits(@Param('orderId') orderId: string) { return this.kits.list(orderId); }
  @Post('orders/:orderId/kits/generate') generateKits(@Param('orderId') orderId: string) { return this.kits.generate(orderId); }
  @Post('kit-lines/:lineId/allocate') allocateKitLine(@Param('lineId') lineId: string, @Body() dto: AdjustManufacturingKitLineDto) { return this.kits.allocate(lineId, dto); }
  @Post('kit-lines/:lineId/unallocate') unallocateKitLine(@Param('lineId') lineId: string, @Body() dto: AdjustManufacturingKitLineDto) { return this.kits.unallocate(lineId, dto); }
  @Post('kit-lines/:lineId/waive') waiveKitLine(@Param('lineId') lineId: string, @Body() dto: WaiveManufacturingKitLineDto) { return this.kits.waive(lineId, dto); }
  @Post('kits/:kitId/release') releaseKit(@Param('kitId') kitId: string, @Body() dto: ReleaseManufacturingKitDto) { return this.kits.release(kitId, dto); }
  @Post('kits/:kitId/cancel') cancelKit(@Param('kitId') kitId: string, @Body() dto: CancelManufacturingKitDto) { return this.kits.cancel(kitId, dto); }
}
