import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class TelemetryService {
  constructor(private prisma: PrismaService) {}

  async insertTelemetry(tenantId: string, asset: string, sensor: string, ts: Date, value: number, meta: any = {}) {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO telemetry (tenant_id, asset_code, sensor_type, ts, value, meta) VALUES ($1,$2,$3,$4,$5,$6)`,
      tenantId, asset, sensor, ts, value, meta
    );
  }

  async lastTelemetry(tenantId: string, asset: string, sensor: string) {
    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT ts, value FROM telemetry WHERE tenant_id = $1 AND asset_code = $2 AND sensor_type = $3 ORDER BY ts DESC LIMIT 1`,
      tenantId, asset, sensor
    );
    return rows[0];
  }

  async kpis(tenantId: string) {
    // KPIs simples de demo (placeholders)
    const backlog = await this.prisma.workOrder.count({ where: { tenantId, status: { in: ['OPEN','IN_PROGRESS'] } } });
    const totalWO = await this.prisma.workOrder.count({ where: { tenantId } });
    const pmCount = await this.prisma.workOrder.count({ where: { tenantId, type: 'PM' } });
    const preventivePct = totalWO ? Math.round((pmCount / totalWO) * 100) : 0;
    return { availability: 98.5, mtbf: 120.3, mttr: 1.7, backlog, preventivePct };
  }
}
