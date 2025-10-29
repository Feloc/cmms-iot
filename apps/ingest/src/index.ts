import 'dotenv/config';
import mqtt from 'mqtt';
import pino from 'pino';
import { z } from 'zod';
import { createPool, withTenant } from './db.js';
import { parseTopic } from './mqtt-topics.js';
import { loadRules, evalRulesForMetric, Rule } from './rules.js';
import { createId } from '@paralleldrive/cuid2';

const log = pino({ level: process.env.LOG_LEVEL || 'info', name: 'ingest' });
const pool = createPool();

// Cache de reglas por tenant
const rulesByTenant = new Map<string, Rule[]>();

async function resolveTenantId(tenantSlug: string): Promise<string | null> {
  try {
    const { rows } = await pool.query(`SELECT id FROM public."Tenant" WHERE slug = $1`, [tenantSlug]);
    return rows[0]?.id ?? null;
  } catch (err: any) {
    if (err?.code === '42P01') { log.warn('Tabla public."Tenant" no existe aún'); return null; }
    throw err;
  }
}

async function resolveDevice(tenantId: string, deviceIdOrKey: string): Promise<{ id: string; assetId: string | null } | null> {
  try {
    const sql = `SELECT d."id", d."assetId" FROM public."Device" d WHERE d."tenantId"=$1 AND (d."id"=$2 OR d."ingestKey"=$2)`;
    const { rows } = await pool.query(sql, [tenantId, deviceIdOrKey]);
    if (!rows[0]) return null;
    return { id: rows[0].id, assetId: rows[0].assetId ?? null };
  } catch (err: any) {
    if (err?.code === '42P01') { log.warn('Tabla public."Device" no existe aún'); return null; }
    throw err;
  }
}

const TelemetryPayload = z.object({
  ts: z.number().or(z.string()).optional(),
  metric: z.string().optional(),
  value: z.number().optional(),
  unit: z.string().optional(),
  quality: z.string().optional(),
  attrs: z.record(z.any()).optional(),
  metrics: z.record(z.number()).optional(),
  meta: z.record(z.any()).optional()
});

type TelemetryRow = {
  tenantId: string; deviceId: string; ts: Date; metric: string; valueDouble: number | null; unit?: string | null; attrs?: any;
};

function toRows(tenantId: string, deviceId: string, payload: z.infer<typeof TelemetryPayload>): TelemetryRow[] {
  const ts = payload.ts ? new Date(Number(payload.ts)) : new Date();
  const out: TelemetryRow[] = [];
  if (payload.metrics && typeof payload.metrics === 'object') {
    for (const [metric, val] of Object.entries(payload.metrics)) {
      if (typeof val === 'number') {
        out.push({ tenantId, deviceId, ts, metric, valueDouble: val, unit: payload.unit, attrs: payload.meta });
      }
    }
  } else if (payload.metric && typeof payload.value === 'number') {
    out.push({ tenantId, deviceId, ts, metric: payload.metric, valueDouble: payload.value, unit: payload.unit, attrs: payload.attrs });
  }
  return out;
}

async function insertTelemetry(rows: TelemetryRow[]) {
  if (rows.length === 0) return;
  const client = await pool.connect();
  try {
    await withTenant(client, rows[0].tenantId, async () => {
      const sql = `
        INSERT INTO timeseries.telemetry
          (tenant_id, device_id, ts, metric, value_double, unit, attrs)
        VALUES ${rows.map((_, i) => `($${i*7+1}, $${i*7+2}, $${i*7+3}, $${i*7+4}, $${i*7+5}, $${i*7+6}, $${i*7+7})`).join(',')}
        ON CONFLICT (tenant_id, device_id, ts, metric) DO UPDATE
          SET value_double = EXCLUDED.value_double,
              unit = EXCLUDED.unit,
              attrs = EXCLUDED.attrs
      `;
      const params = rows.flatMap(r => [r.tenantId, r.deviceId, r.ts, r.metric, r.valueDouble, r.unit ?? null, r.attrs ?? null]);
      await client.query(sql, params);
    });
  } finally {
    client.release();
  }
}

async function upsertRuleStateAndEvent(
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
      // Asegurar tablas existen
      // RuleState: id es TEXT (cuid) en Prisma → generamos id en app
      const rsId = createId();
      await client.query(`
        INSERT INTO public."RuleState" ("id", "tenantId", "ruleId", "status", "lastChangeAt")
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT ("ruleId") DO UPDATE SET "status"=EXCLUDED."status", "lastChangeAt"=EXCLUDED."lastChangeAt"
      `, [rsId, tenantId, ruleId, newStatus]);

      if (newStatus === 'ALERTING') {
        const evId = createId();
        await client.query(`
          INSERT INTO public."AssetEvent" ("id","tenantId","assetId","deviceId","ruleId","message","severity","status","createdAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', now())
        `, [evId, tenantId, assetId, deviceId, ruleId, message || 'Rule triggered', severity]);
      } else {
        await client.query(`
          UPDATE public."AssetEvent"
             SET "status"='CLOSED', "closedAt"=now()
           WHERE "tenantId"=$1 AND "ruleId"=$2 AND "deviceId"=$3 AND "status"='OPEN'
        `, [tenantId, ruleId, deviceId]);
      }
    });
  } catch (err: any) {
    if (err?.code === '42P01') {
      log.warn('Tablas de reglas/eventos no existen aún; omito escritura hasta migrar');
      return;
    }
    throw err;
  } finally {
    client.release();
  }
}

async function refreshRulesPeriodically() {
  const sec = Number(process.env.INGEST_RULES_REFRESH_SEC || 15);
  const run = async () => {
    try {
      const rules = await loadRules(pool);
      const byTenant = new Map<string, Rule[]>();
      for (const r of rules) {
        const arr = byTenant.get(r.tenantId) || [];
        arr.push(r); byTenant.set(r.tenantId, arr);
      }
      rulesByTenant.clear();
      for (const [k, v] of byTenant.entries()) rulesByTenant.set(k, v);
      log.debug({ tenants: [...rulesByTenant.keys()] }, 'rules refreshed');
    } catch (err) {
      // Ya se maneja 42P01 dentro de loadRules; otros errores sí los mostramos
      log.error({ err }, 'rules refresh failed');
    } finally {
      setTimeout(run, sec * 1000).unref();
    }
  };
  run();
}

function startMqtt() {
  const url = process.env.MQTT_URL || 'mqtt://localhost:1883';
  const username = process.env.MQTT_USERNAME || undefined;
  const password = process.env.MQTT_PASSWORD || undefined;
  const client = mqtt.connect(url, { username, password, keepalive: 30, reconnectPeriod: 2000 });

  client.on('connect', () => {
    log.info({ url }, 'MQTT connected');
    const subs = (process.env.MQTT_SUBSCRIPTIONS || 'tenants/+/devices/+/telemetry,tenants/+/devices/+/state')
      .split(',').map(s => s.trim()).filter(Boolean);
    for (const s of subs) client.subscribe(s, { qos: 1 }, (err) => err && log.error({ err, s }, 'subscribe error'));
  });

  client.on('reconnect', () => log.warn('MQTT reconnecting...'));
  client.on('error', (err) => log.error({ err }, 'MQTT error'));

  client.on('message', async (topic, payloadBuf) => {
    const p = parseTopic(topic);
    if (!p) return;
    try {
      const payloadStr = payloadBuf.toString('utf8');
      const json = JSON.parse(payloadStr);
      const parsed = TelemetryPayload.parse(json);

      const tenantId = await resolveTenantId(p.tenantSlug);
      if (!tenantId) return log.warn({ topic }, 'unknown tenant');
      const dev = await resolveDevice(tenantId, p.deviceId);
      if (!dev) return log.warn({ topic }, 'unknown device');

      if (p.channel.startsWith('telemetry')) {
        const rows = toRows(tenantId, dev.id, parsed);
        if (rows.length) {
          await insertTelemetry(rows);
          const rules = rulesByTenant.get(tenantId) || [];
          for (const r of rows) {
            if (typeof r.valueDouble === 'number') {
              const events = evalRulesForMetric(rules, tenantId, dev.id, dev.assetId, r.metric, r.ts.getTime(), r.valueDouble);
              for (const ev of events) {
                await upsertRuleStateAndEvent(tenantId, dev.id, dev.assetId, ev.rule.id, ev.rule.severity, ev.newStatus, ev.message);
              }
            }
          }
        }
      } else if (p.channel.startsWith('state')) {
        try {
          await pool.query(`UPDATE public."Device" SET "lastSeen" = now(), "status"='ONLINE' WHERE "id"=$1 AND "tenantId"=$2`, [dev.id, tenantId]);
        } catch (err: any) {
          if (err?.code === '42P01') log.warn('Tabla public."Device" no existe aún'); else throw err;
        }
      }
    } catch (err: any) {
      log.error({ err, topic }, 'processing error');
    }
  });
}

async function main() {
  await refreshRulesPeriodically();
  startMqtt();
}

main().catch((e) => { log.error(e); process.exit(1); });
