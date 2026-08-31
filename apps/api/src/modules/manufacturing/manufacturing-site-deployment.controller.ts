import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ManufacturingSiteDeploymentService } from './manufacturing-site-deployment.service';
import {
  CompleteManufacturingSiteReceiptDto,
  CreateManufacturingSiteInstallationDto,
  UpdateManufacturingSiteReceiptCheckDto,
} from './dto/manufacturing-site-deployment.dto';

@Controller('manufacturing')
export class ManufacturingSiteDeploymentController {
  constructor(private readonly service: ManufacturingSiteDeploymentService) {}

  @Get('orders/:orderId/site-deployments')
  list(@Param('orderId') orderId: string) { return this.service.list(orderId); }

  @Post('dispatches/:dispatchId/site-deployment')
  create(@Param('dispatchId') dispatchId: string) { return this.service.create(dispatchId); }

  @Patch('site-receipt-checks/:checkId')
  updateCheck(@Param('checkId') checkId: string, @Body() dto: UpdateManufacturingSiteReceiptCheckDto) {
    return this.service.updateReceiptCheck(checkId, dto);
  }

  @Post('site-deployments/:deploymentId/receive')
  receive(@Param('deploymentId') deploymentId: string, @Body() dto: CompleteManufacturingSiteReceiptDto) {
    return this.service.completeReceipt(deploymentId, dto);
  }

  @Post('site-deployments/:deploymentId/installation')
  installation(@Param('deploymentId') deploymentId: string, @Body() dto: CreateManufacturingSiteInstallationDto) {
    return this.service.createInstallation(deploymentId, dto);
  }
}
