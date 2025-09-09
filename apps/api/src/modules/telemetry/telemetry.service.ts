// apps/api/src/modules/telemetry/telemetry.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
// 👇 importa Prisma para el helper de raw queries
import { Prisma } from '@prisma/client';

@Injectable()
export class TelemetryService {
  constructor(private prisma: PrismaService) {}

  async insertTelemetry(
    tenantId: string,
    assetCode: string,
    sensor: string,
    ts: Date,
    value: number,
    meta: Record<string, any> = {},
  ) {
    // Asegura que ts es una Date válida
    const tsSafe = ts instanceof Date && !isNaN(ts.getTime()) ? ts : new Date();
    // Asegura meta como objeto plano
    const metaSafe = meta && typeof meta === 'object' ? meta : {};

    // ✅ Usa plantilla etiquetada: Prisma parametriza cada valor ($1..$6)
    await this.prisma.$executeRaw`
      INSERT INTO timeseries.telemetry (tenant_id, asset_code, sensor_type, ts, value, meta)
      VALUES (${tenantId}, ${assetCode}, ${sensor}, ${tsSafe}, ${value}, ${metaSafe})
      ON CONFLICT (tenant_id, asset_code, sensor_type, ts)
      DO UPDATE SET value = EXCLUDED.value, meta = EXCLUDED.meta
    `;
  }
}
