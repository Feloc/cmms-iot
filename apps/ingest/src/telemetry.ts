import { z } from 'zod';
import { TelemetryRow } from './db-timescale';

export const TelemetryPayload = z.object({
  ts: z.number().or(z.string()).optional(),
  unit: z.string().optional(),
  attrs: z.record(z.any()).optional(),
  // Dos formas:
  metric: z.string().optional(),
  value: z.number().optional(),
  // o varias métricas:
  metrics: z.record(z.number()).optional(),
  values: z.record(z.number()).optional(),
});

export function toRows(tenantId: string, deviceId: string, payload: z.infer<typeof TelemetryPayload>): TelemetryRow[] {
  const ts = payload.ts ? new Date(Number(payload.ts)) : new Date();
  const out: TelemetryRow[] = [];
  if (payload.values && typeof payload.values === 'object') {
    for (const [metric, val] of Object.entries(payload.values)) {
      if (typeof val === 'number') {
        out.push({ tenantId, deviceId, ts, metric, valueDouble: val, unit: payload.unit, attrs: payload.attrs });
      }
    }
  } else if (payload.metric && typeof payload.value === 'number') {
    out.push({ tenantId, deviceId, ts, metric: payload.metric, valueDouble: payload.value, unit: payload.unit, attrs: payload.attrs });
  }
  return out;
}
