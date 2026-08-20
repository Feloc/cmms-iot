import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ManufacturingSupplyService } from './manufacturing-supply.service';
import { GenerateManufacturingSupplyPlanDto, UpdateManufacturingSupplyRequirementDto } from './dto/manufacturing-supply.dto';

@Controller('manufacturing')
export class ManufacturingSupplyController {
  constructor(private readonly service: ManufacturingSupplyService) {}

  @Get('orders/:orderId/supply-plans') list(@Param('orderId') orderId: string) { return this.service.list(orderId); }
  @Post('orders/:orderId/supply-plans/generate') generate(@Param('orderId') orderId: string, @Body() dto: GenerateManufacturingSupplyPlanDto) { return this.service.generate(orderId, dto); }
  @Patch('supply-requirements/:requirementId') updateRequirement(@Param('requirementId') requirementId: string, @Body() dto: UpdateManufacturingSupplyRequirementDto) { return this.service.updateRequirement(requirementId, dto); }
}
