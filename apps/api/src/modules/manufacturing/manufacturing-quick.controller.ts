import { UseGuards, UsePipes } from '@nestjs/common';
import { ManufacturingAccessGuard } from './manufacturing-access.guard';
import { ManufacturingValidationPipe } from './manufacturing-validation.pipe';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ManufacturingQuickService } from './manufacturing-quick.service';
import { CreateManufacturingQuickProfileDto, EnableManufacturingQuickDto, ManufacturingQuickCommandDto, ManufacturingQuickProfileActionDto } from './dto/manufacturing-quick.dto';

@UseGuards(ManufacturingAccessGuard)
@UsePipes(ManufacturingValidationPipe)
@Controller('manufacturing')
export class ManufacturingQuickController {
  constructor(private readonly service: ManufacturingQuickService) {}
  @Get('quick-metrics') metrics() { return this.service.metrics(); }
  @Get('quick-profiles/items/:itemId') profiles(@Param('itemId') itemId: string) { return this.service.profiles(itemId); }
  @Post('quick-profiles/items/:itemId') create(@Param('itemId') itemId: string, @Body() body: CreateManufacturingQuickProfileDto) { return this.service.createProfile(itemId, body); }
  @Post('quick-profiles/:profileId/:action') profileAction(@Param('profileId') id: string, @Param('action') action: string, @Body() body: ManufacturingQuickProfileActionDto) { return this.service.profileAction(id, action, body); }
  @Get('orders/:id/quick') get(@Param('id') id: string) { return this.service.get(id); }
  @Post('orders/:id/quick-enable') enable(@Param('id') id: string, @Body() body: EnableManufacturingQuickDto) { return this.service.enable(id, body); }
  @Post('orders/:id/quick/:action') command(@Param('id') id: string, @Param('action') action: string, @Body() body: ManufacturingQuickCommandDto) { return this.service.command(id, action, body); }
}
