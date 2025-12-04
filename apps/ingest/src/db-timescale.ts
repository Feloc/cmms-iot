import { Pool } from 'pg';
import { withTenant } from './db';

export type TelemetryRow = {
  tenantId: string;
  deviceId: string;
  ts: Date;
  metric: string;
  valueDouble: number | null;
  unit?: string | null;
  attrs?: any;
};

export async function insertTelemetry(pool: Pool, rows: TelemetryRow[]) {
  if (!rows.length) return;
  const client = await pool.connect();
  try {
    await withTenant(client, rows[0].tenantId, async () => {
      const values = rows
        .map((_, i) => `($${i*7+1}, $${i*7+2}, $${i*7+3}, $${i*7+4}, $${i*7+5}, $${i*7+6}, $${i*7+7})`)
        .join(',');
      const sql = `
        INSERT INTO timeseries.telemetry
          (tenant_id, device_id, ts, metric, value_double, unit, attrs)
        VALUES ${values}
        ON CONFLICT (tenant_id, device_id, ts, metric) DO UPDATE
          SET value_double = EXCLUDED.value_double,
              unit = EXCLUDED.unit,
              attrs = EXCLUDED.attrs`;
      const params = rows.flatMap(r => [r.tenantId, r.deviceId, r.ts, r.metric, r.valueDouble, r.unit ?? null, r.attrs ?? null]);
      await client.query(sql, params);
    });
  } finally {
    client.release();
  }
}
