import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

export type TelemetryPoint = { ts: string; value: number | null; unit: string | null };

@Injectable()
export class TelemetryService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveTenantIdBySlug(slug: string): Promise<string | null> {
    const t = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    return t?.id ?? null;
  }

  private clampWindow(from?: Date, to?: Date) {
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - 24 * 3600 * 1000);
    if (start > end) throw new BadRequestException('from > to');
    return { start, end };
  }

  private async withTenant<T>(tenantId: string, run: (tx: any) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId.replace(/'/g, "''")}'`);
      return run(tx);
    });
  }

  async metricsByDevice(tenantId: string, deviceId: string): Promise<string[]> {
    return this.withTenant(tenantId, async (tx) => {
      const rows: any[] = await tx.$queryRawUnsafe(
        `SELECT DISTINCT metric
           FROM timeseries.telemetry
          WHERE tenant_id = $1 AND device_id = $2
          ORDER BY metric ASC`,
        tenantId, deviceId,
      );
      return rows.map((r) => r.metric);
    });
  }

  async metricsByAsset(tenantId: string, assetId: string): Promise<string[]> {
    const devices = await this.prisma.device.findMany({
      where: { tenantId, assetId },
      select: { id: true },
    });
    if (!devices.length) return [];
    const ids = devices.map((d) => d.id);

    return this.withTenant(tenantId, async (tx) => {
      const rows: any[] = await tx.$queryRawUnsafe(
        `SELECT DISTINCT metric
           FROM timeseries.telemetry
          WHERE tenant_id = $1 AND device_id = ANY($2::text[])
          ORDER BY metric ASC`,
        tenantId, ids,
      );
      return rows.map((r) => r.metric);
    });
  }

  async byDevice(
    tenantId: string,
    deviceId: string,
    metric: string,
    from?: Date,
    to?: Date,
    bucket: 'raw' | '5m' = 'raw',
    limit?: number,
  ): Promise<TelemetryPoint[]> {
    const safetyLimit = bucket === 'raw' ? Math.min(limit ?? 2000, 20000) : Math.min(limit ?? 1000, 10000);
    const hasWindow = !!from || !!to;
    const window = hasWindow ? this.clampWindow(from, to) : null;

    return this.withTenant(tenantId, async (tx) => {
      if (bucket === '5m') {
        const args = hasWindow
          ? [tenantId, deviceId, metric, window!.start, window!.end]
          : [tenantId, deviceId, metric];

        const rows: any[] = await tx.$queryRawUnsafe(
          `SELECT bucket as ts, v_avg as value, unit
             FROM timeseries.v_telemetry_5m
            WHERE tenant_id = $1 AND device_id = $2 AND metric = $3
              ${hasWindow ? 'AND bucket >= $4 AND bucket < $5' : ''}
            ORDER BY bucket ${hasWindow ? 'ASC' : 'DESC'}
            LIMIT ${safetyLimit}`,
          ...args,
        );
        if (!hasWindow) rows.reverse();
        return rows.map((r) => ({ ts: new Date(r.ts).toISOString(), value: r.value, unit: r.unit ?? null }));
      }

      const args = hasWindow
        ? [tenantId, deviceId, metric, window!.start, window!.end]
        : [tenantId, deviceId, metric];

      const rows: any[] = await tx.$queryRawUnsafe(
        `SELECT ts, value_double as value, unit
           FROM timeseries.telemetry
          WHERE tenant_id = $1 AND device_id = $2 AND metric = $3
            ${hasWindow ? 'AND ts >= $4 AND ts < $5' : ''}
          ORDER BY ts ${hasWindow ? 'ASC' : 'DESC'}
          LIMIT ${safetyLimit}`,
        ...args,
      );
      if (!hasWindow) rows.reverse();
      return rows.map((r) => ({ ts: new Date(r.ts).toISOString(), value: r.value, unit: r.unit ?? null }));
    });
  }

  async byAsset(
    tenantId: string,
    assetId: string,
    metric: string,
    from?: Date,
    to?: Date,
    bucket: 'raw' | '5m' = 'raw',
    limit?: number,
  ): Promise<TelemetryPoint[]> {
    const devices = await this.prisma.device.findMany({
      where: { tenantId, assetId },
      select: { id: true },
    });
    if (!devices.length) return [];

    const seriesPerDevice = await Promise.all(
      devices.map((d) => this.byDevice(tenantId, d.id, metric, from, to, bucket, limit)),
    );

    const map = new Map<string, { sum: number; n: number; unit: string | null }>();
    for (const s of seriesPerDevice) {
      for (const p of s) {
        const e = map.get(p.ts) || { sum: 0, n: 0, unit: p.unit };
        if (typeof p.value === 'number') { e.sum += p.value; e.n += 1; }
        e.unit = e.unit ?? p.unit ?? null;
        map.set(p.ts, e);
      }
    }

    return Array.from(map.entries())
      .map(([ts, e]) => ({ ts, value: e.n ? e.sum / e.n : null, unit: e.unit }))
      .sort((a, b) => a.ts.localeCompare(b.ts));
  }
}
