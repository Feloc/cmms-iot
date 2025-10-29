import { Controller, Get, Param, Query, BadRequestException } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { TelemetryQueryDto } from './dto/telemetry-query.dto';
import { tenantStorage } from '../../common/tenant-context';

@Controller()
export class TelemetryController {
  constructor(private readonly svc: TelemetryService) {}

  @Get('devices/:deviceId/telemetry')
  async byDevice(@Param('deviceId') deviceId: string, @Query() q: TelemetryQueryDto) {
    const tenantId = tenantStorage.getStore()?.tenantId;
    if (!tenantId) throw new BadRequestException('No tenant in context');

    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    const bucket = q.bucket ?? 'raw';
    const limit = q.limit;

    return this.svc.byDevice(tenantId, deviceId, q.metric, from, to, bucket, limit);
  }

  @Get('assets/:assetId/telemetry')
  async byAsset(@Param('assetId') assetId: string, @Query() q: TelemetryQueryDto) {
    const tenantId = tenantStorage.getStore()?.tenantId;
    if (!tenantId) throw new BadRequestException('No tenant in context');

    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    const bucket = q.bucket ?? 'raw';
    const limit = q.limit;

    return this.svc.byAsset(tenantId, assetId, q.metric, from, to, bucket, limit);
  }
}
