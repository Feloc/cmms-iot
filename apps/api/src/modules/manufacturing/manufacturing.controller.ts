import { UseGuards, UsePipes } from '@nestjs/common';
import { ManufacturingAccessGuard } from './manufacturing-access.guard';
import { ManufacturingValidationPipe } from './manufacturing-validation.pipe';
import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  CreateManufacturingOrderDto,
  ManufacturingReasonDto,
  ReplaceManufacturingMembersDto,
  ReceiveSparePartOutputDto,
  UpdateManufacturedUnitDto,
  UpdateManufacturingOrderDto,
} from './dto/manufacturing.dto';
import { ManufacturingService } from './manufacturing.service';

@UseGuards(ManufacturingAccessGuard)
@UsePipes(ManufacturingValidationPipe)
@Controller('manufacturing')
export class ManufacturingController {
  constructor(private readonly service: ManufacturingService) {}

  @Get('orders')
  listOrders(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('orderType') orderType?: string,
    @Query('responsibleUserId') responsibleUserId?: string,
    @Query('priority') priority?: string,
    @Query('deliveryFrom') deliveryFrom?: string,
    @Query('deliveryTo') deliveryTo?: string,
    @Query('engineeringPending') engineeringPending?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('sort') sort?: string,
  ) {
    return this.service.listOrders({
      q, status, orderType, responsibleUserId, priority, deliveryFrom, deliveryTo,
      engineeringPending, page, size, sort,
    });
  }

  @Post('orders')
  createOrder(@Body() dto: CreateManufacturingOrderDto) {
    return this.service.createOrder(dto);
  }

  @Get('orders/:id')
  getOrder(@Param('id') id: string) {
    return this.service.getOrder(id);
  }

  @Patch('orders/:id')
  updateOrder(@Param('id') id: string, @Body() dto: UpdateManufacturingOrderDto) {
    return this.service.updateOrder(id, dto);
  }

  @Post('orders/:id/hold')
  holdOrder(@Param('id') id: string, @Body() dto: ManufacturingReasonDto) {
    return this.service.holdOrder(id, dto);
  }

  @Post('orders/:id/resume')
  resumeOrder(@Param('id') id: string) {
    return this.service.resumeOrder(id);
  }

  @Post('orders/:id/cancel')
  cancelOrder(@Param('id') id: string, @Body() dto: ManufacturingReasonDto) {
    return this.service.cancelOrder(id, dto);
  }

  @Post('orders/:id/receive-spare-output')
  receiveSpareOutput(@Param('id') id: string, @Body() dto: ReceiveSparePartOutputDto) {
    return this.service.receiveSparePartOutput(id, dto ?? ({} as ReceiveSparePartOutputDto));
  }

  @Get('orders/:id/history')
  history(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.service.history(id, page, size);
  }

  @Get('orders/:id/units')
  units(@Param('id') id: string) {
    return this.service.listUnits(id);
  }

  @Patch('orders/:id/units/:unitId')
  updateUnit(
    @Param('id') id: string,
    @Param('unitId') unitId: string,
    @Body() dto: UpdateManufacturedUnitDto,
  ) {
    return this.service.updateUnit(id, unitId, dto);
  }

  @Put('orders/:id/members')
  replaceMembers(@Param('id') id: string, @Body() dto: ReplaceManufacturingMembersDto) {
    return this.service.replaceMembers(id, dto);
  }
}
