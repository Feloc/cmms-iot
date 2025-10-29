import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

export type TelemetryPoint = { ts: string; value: number | null; unit: string | null };

@Injectable()
export class TelemetryService {
  constructor(private readonly prisma: PrismaService) {}

  private clampWindow(from?: Date, to?: Date) {
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - 24 * 3600 * 1000);
    if (start > end) throw new BadRequestException('from > to');
    return { start, end };
  }

  /** Ejecuta un bloque dentro de una tx con SET LOCAL app.tenant_id */
  private async withTenant<T>(tenantId: string, run: (tx: any) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      // Usa EXECUTE RAW para fijar tenant por conexión
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId.replace(/'/g, "''")}'`);
      return run(tx);
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
    const { start, end } = this.clampWindow(from, to);
    const tbl = bucket === '5m' ? 'timeseries.v_telemetry_5m' : 'timeseries.v_telemetry';
    const timeCol = bucket === '5m' ? 'bucket' : 'ts';
    const safetyLimit = bucket === 'raw' ? Math.min(limit ?? 10000, 20000) : Math.min(limit ?? 5000, 10000);

    return this.withTenant(tenantId, async (tx) => {
      const rows: any[] = await tx.$queryRawUnsafe(
        `SELECT ${timeCol} as ts, ${bucket === '5m' ? 'v_avg' : 'value_double'} as value, unit
         FROM ${tbl}
         WHERE device_id = $1 AND metric = $2 AND ${timeCol} >= $3 AND ${timeCol} < $4
         ORDER BY ${timeCol} ASC
         LIMIT ${safetyLimit}`,
        deviceId, metric, start, end,
      );
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
    // 1) lista devices del asset
    const devices = await this.prisma.device.findMany({
      where: { tenantId, assetId },
      select: { id: true },
    });
    if (!devices.length) return [];

    // 2) consulta para todos los devices y merge por timestamp (suma/avg simple)
    const seriesPerDevice = await Promise.all(
      devices.map((d) => this.byDevice(tenantId, d.id, metric, from, to, bucket, limit)),
    );

    // 3) merge: si hay varias series, agregamos por timestamp (avg)
    const map = new Map<string, { valueSum: number; n: number; unit: string | null }>();
    for (const s of seriesPerDevice) {
      for (const p of s) {
        const key = p.ts;
        const entry = map.get(key) || { valueSum: 0, n: 0, unit: p.unit };
        if (typeof p.value === 'number') {
          entry.valueSum += p.value; entry.n += 1;
        }
        entry.unit = entry.unit ?? p.unit ?? null;
        map.set(key, entry);
      }
    }
    const out: TelemetryPoint[] = Array.from(map.entries())
      .map(([ts, e]) => ({ ts, value: e.n ? e.valueSum / e.n : null, unit: e.unit }))
      .sort((a, b) => a.ts.localeCompare(b.ts));
    return out;
  }
}
