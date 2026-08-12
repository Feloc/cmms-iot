import { Controller, Get, Param, Query, BadRequestException } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { TelemetryQueryDto } from './dto/telemetry-query.dto';
import { tenantStorage } from '../../common/tenant-context';

/**
 * El JwtAuthGuard global verifica el token y establece el tenant en AsyncLocalStorage.
 */
@Controller()
export class TelemetryController {
  constructor(private readonly svc: TelemetryService) {}

  private requireTenantId(): string {
    const storeTenantId = tenantStorage.getStore()?.tenantId;
    if (storeTenantId) return storeTenantId;
    throw new BadRequestException('No tenant in verified authentication context');
  }

  @Get('devices/:deviceId/metrics')
  async metricsByDevice(@Param('deviceId') deviceId: string) {
    const tenantId = this.requireTenantId();
    return this.svc.metricsByDevice(tenantId, deviceId);
  }

  @Get('devices/:deviceId/telemetry')
  async byDevice(
    @Param('deviceId') deviceId: string,
    @Query() q: TelemetryQueryDto,
  ) {
    const tenantId = this.requireTenantId();
    if (!q.metric) throw new BadRequestException('metric is required');

    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    const bucket = q.bucket ?? 'raw';
    const limit = q.limit;

    return this.svc.byDevice(tenantId, deviceId, q.metric, from, to, bucket, limit);
  }

  @Get('assets/:assetId/metrics')
  async metricsByAsset(@Param('assetId') assetId: string) {
    const tenantId = this.requireTenantId();
    return this.svc.metricsByAsset(tenantId, assetId);
  }

  @Get('assets/:assetId/telemetry')
  async byAsset(
    @Param('assetId') assetId: string,
    @Query() q: TelemetryQueryDto,
  ) {
    const tenantId = this.requireTenantId();
    if (!q.metric) throw new BadRequestException('metric is required');

    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    const bucket = q.bucket ?? 'raw';
    const limit = q.limit;

    return this.svc.byAsset(tenantId, assetId, q.metric, from, to, bucket, limit);
  }
}
