import { Controller, Get, Param, Query, BadRequestException, Headers } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { TelemetryQueryDto } from './dto/telemetry-query.dto';
import { tenantStorage } from '../../common/tenant-context';

/**
 * Robust tenant resolution:
 * 1) AsyncLocalStorage (tenantStorage) -> tenantId
 * 2) Header x-tenant-id / x-tenantid -> tenantId
 * 3) Header x-tenant (slug) -> resolve to tenantId
 * 4) Authorization: Bearer <jwt> -> decode payload.tenantId (NO verify; middleware should verify elsewhere)
 */
@Controller()
export class TelemetryController {
  constructor(private readonly svc: TelemetryService) {}

  private decodeJwtTenantId(authHeader?: string): string | null {
    try {
      if (!authHeader) return null;
      const raw = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      const parts = raw.split('.');
      if (parts.length < 2) return null;
      const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = payloadB64.length % 4 ? '='.repeat(4 - (payloadB64.length % 4)) : '';
      const json = Buffer.from(payloadB64 + pad, 'base64').toString('utf8');
      const payload = JSON.parse(json);
      return typeof payload?.tenantId === 'string' ? payload.tenantId : null;
    } catch {
      return null;
    }
  }

  private async requireTenantId(headers: Record<string, any>): Promise<string> {
    const storeTenantId = tenantStorage.getStore()?.tenantId;
    if (storeTenantId) return storeTenantId;

    // 2) tenantId direct header
    const tenantIdHdr =
      (headers['x-tenant-id'] as string | undefined) ??
      (headers['x-tenantid'] as string | undefined);

    if (tenantIdHdr && String(tenantIdHdr).trim()) return String(tenantIdHdr).trim();

    // 3) slug header
    const slug = (headers['x-tenant'] as string | undefined)?.trim();
    if (slug) {
      const tid = await this.svc.resolveTenantIdBySlug(slug);
      if (!tid) throw new BadRequestException('Unknown tenant (x-tenant)');
      return tid;
    }

    // 4) decode JWT payload
    const tidFromJwt = this.decodeJwtTenantId(headers['authorization'] as string | undefined);
    if (tidFromJwt) return tidFromJwt;

    throw new BadRequestException('No tenant in context (missing x-tenant)');
  }

  @Get('devices/:deviceId/metrics')
  async metricsByDevice(@Param('deviceId') deviceId: string, @Headers() headers: Record<string, any>) {
    const tenantId = await this.requireTenantId(headers);
    return this.svc.metricsByDevice(tenantId, deviceId);
  }

  @Get('devices/:deviceId/telemetry')
  async byDevice(
    @Param('deviceId') deviceId: string,
    @Query() q: TelemetryQueryDto,
    @Headers() headers: Record<string, any>,
  ) {
    const tenantId = await this.requireTenantId(headers);
    if (!q.metric) throw new BadRequestException('metric is required');

    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    const bucket = q.bucket ?? 'raw';
    const limit = q.limit;

    return this.svc.byDevice(tenantId, deviceId, q.metric, from, to, bucket, limit);
  }

  @Get('assets/:assetId/metrics')
  async metricsByAsset(@Param('assetId') assetId: string, @Headers() headers: Record<string, any>) {
    const tenantId = await this.requireTenantId(headers);
    return this.svc.metricsByAsset(tenantId, assetId);
  }

  @Get('assets/:assetId/telemetry')
  async byAsset(
    @Param('assetId') assetId: string,
    @Query() q: TelemetryQueryDto,
    @Headers() headers: Record<string, any>,
  ) {
    const tenantId = await this.requireTenantId(headers);
    if (!q.metric) throw new BadRequestException('metric is required');

    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    const bucket = q.bucket ?? 'raw';
    const limit = q.limit;

    return this.svc.byAsset(tenantId, assetId, q.metric, from, to, bucket, limit);
  }
}
