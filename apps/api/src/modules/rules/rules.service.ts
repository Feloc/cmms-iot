import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class RulesService {
  constructor(private prisma: PrismaService) {}

  async evaluateRules(tenantId: string, assetCode: string, sensor: string, ts: Date, value: number) {
    const rules = await this.prisma.rule.findMany({ where: { tenantId, assetCode, sensor, enabled: true } });
    for (const r of rules) {
      if (r.type === 'THRESHOLD' && r.operator && r.value !== null) {
        const ok = this.compare(value, r.operator, r.value!);
        if (ok) await this.raise(tenantId, assetCode, sensor, `THRESHOLD ${sensor} ${r.operator} ${r.value}: ${value} @ ${ts.toISOString()}`, 'THRESHOLD');
      }
      if (r.type === 'ROC' && r.windowSec && r.rocValue !== null) {
        const since = new Date(ts.getTime() - r.windowSec! * 1000);
        const rows: any[] = await this.prisma.$queryRawUnsafe(
          `SELECT value FROM telemetry WHERE tenant_id=$1 AND asset_code=$2 AND sensor_type=$3 AND ts>= $4 ORDER BY ts ASC`,
          tenantId, assetCode, sensor, since
        );
        if (rows.length > 0) {
          const delta = Math.abs(value - rows[0].value);
          if (delta > r.rocValue!) await this.raise(tenantId, assetCode, sensor, `ROC ${sensor} Δ>${r.rocValue}: ${delta.toFixed(2)} @ ${ts.toISOString()}`, 'ROC');
        }
      }
    }
  }

  private compare(v: number, op: string, threshold: number) {
    switch (op) {
      case '>': return v > threshold;
      case '>=': return v >= threshold;
      case '<': return v < threshold;
      case '<=': return v <= threshold;
      default: return false;
    }
  }

  private async raise(tenantId: string, assetCode: string, sensor: string, message: string, kind: string) {
    const alert = await this.prisma.alert.create({ data: { tenantId, assetCode, sensor, message, kind, status: 'OPEN' } });
    await this.prisma.notice.create({ data: { tenantId, alertId: alert.id, title: message, status: 'OPEN' } });
  }
}
