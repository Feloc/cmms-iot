import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ManufacturingReleasesService } from './manufacturing-releases.service';
import { CreateEngineeringReleaseDto, PublishEngineeringReleaseDto, UpdateEngineeringReleaseDto } from './dto/engineering-release.dto';

@Controller('manufacturing/orders/:orderId/releases')
export class ManufacturingReleasesController {
  constructor(private readonly service: ManufacturingReleasesService) {}

  @Get() list(@Param('orderId') orderId: string) { return this.service.list(orderId); }
  @Post() create(@Param('orderId') orderId: string, @Body() dto: CreateEngineeringReleaseDto) { return this.service.create(orderId, dto); }
  @Patch(':releaseId') update(@Param('orderId') orderId: string, @Param('releaseId') releaseId: string, @Body() dto: UpdateEngineeringReleaseDto) { return this.service.update(orderId, releaseId, dto); }
  @Get(':releaseId/validate') validate(@Param('orderId') orderId: string, @Param('releaseId') releaseId: string) { return this.service.validate(orderId, releaseId); }
  @Post(':releaseId/publish') publish(@Param('orderId') orderId: string, @Param('releaseId') releaseId: string, @Body() dto: PublishEngineeringReleaseDto) { return this.service.publish(orderId, releaseId, dto); }
}
