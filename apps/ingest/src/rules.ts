import { Pool } from 'pg';
import pino from 'pino';
import { createId } from '@paralleldrive/cuid2';
import { withTenant } from './db';

const log = pino({ name: 'ingest-rules', level: process.env.LOG_LEVEL || 'info' });

export type Rule = {
  id: string;
  tenantId: string;
  assetId: string | null;
  deviceId: string | null;
  kind: 'THRESHOLD' | 'ROC' | 'WINDOW_AVG';
  metric: string;
  name: string;
  params: any;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
};

export async function loadRules(pool: Pool): Promise<Rule[]> {
  try {
    const { rows } = await pool.query(`
      SELECT r."id", r."tenantId", r."assetId", r."deviceId", r."kind", r."metric", r."name", r."params", r."severity"
      FROM public."Rule" r
      WHERE r."enabled" = true
    `);
    return rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenantId,
      assetId: r.assetId ?? null,
      deviceId: r.deviceId ?? null,
      kind: r.kind,
      metric: r.metric,
      name: r.name,
      params: r.params || {},
      severity: r.severity,
    }));
  } catch (err: any) {
    if (err?.code === '42P01') {
      log.warn('Tabla public."Rule" no existe aún; sin reglas activas');
      return [];
    }
    throw err;
  }
}

export function evalRulesForMetric(
  rules: Rule[],
  tenantId: string,
  deviceId: string,
  assetId: string | null,
  metric: string,
  tsMs: number,
  value: number
) {
  const applicable = rules.filter(r => r.tenantId === tenantId && r.metric === metric && (!r.deviceId || r.deviceId === deviceId));
  const out: { rule: Rule; newStatus: 'ALERTING' | 'NORMAL'; message: string }[] = [];

  for (const r of applicable) {
    if (r.kind === 'THRESHOLD' && r.params?.op && typeof r.params?.threshold === 'number') {
      let trigger = false;
      switch (r.params.op) {
        case '>': trigger = value > r.params.threshold; break;
        case '>=': trigger = value >= r.params.threshold; break;
        case '<': trigger = value < r.params.threshold; break;
        case '<=': trigger = value <= r.params.threshold; break;
      }
      if (trigger) out.push({ rule: r, newStatus: 'ALERTING', message: `${metric} ${r.params.op} ${r.params.threshold}` });
      else out.push({ rule: r, newStatus: 'NORMAL', message: `${metric} within limits` });
    }
  }
  return out;
}

export async function upsertRuleStateAndEvent(
  pool: Pool,
  tenantId: string,
  deviceId: string,
  assetId: string | null,
  ruleId: string,
  severity: string,
  newStatus: 'NORMAL' | 'ALERTING',
  message: string
) {
  const client = await pool.connect();
  try {
    await withTenant(client, tenantId, async () => {
      await client.query(
        `INSERT INTO public."RuleState" ("id","tenantId","ruleId","status","lastChangeAt")
         VALUES ($1,$2,$3,$4, now())
         ON CONFLICT ("ruleId") DO UPDATE SET "status"=EXCLUDED."status", "lastChangeAt"=EXCLUDED."lastChangeAt"`,
        [createId(), tenantId, ruleId, newStatus]
      );

      if (newStatus === 'ALERTING') {
        await client.query(
          `INSERT INTO public."AssetEvent" ("id","tenantId","assetId","deviceId","ruleId","message","severity","status","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,'OPEN', now())`,
          [createId(), tenantId, assetId, deviceId, ruleId, message || 'Rule triggered', severity]
        );
      } else {
        await client.query(
          `UPDATE public."AssetEvent"
             SET "status"='CLOSED', "closedAt"=now()
           WHERE "tenantId"=$1 AND "ruleId"=$2 AND "deviceId"=$3 AND "status"='OPEN'`,
          [tenantId, ruleId, deviceId]
        );
      }
    });
  } catch (err: any) {
    if (err?.code === '42P01') {
      log.warn('Tablas de RuleState/AssetEvent no existen aún; omito evento');
      return;
    }
    throw err;
  } finally {
    client.release();
  }
}
