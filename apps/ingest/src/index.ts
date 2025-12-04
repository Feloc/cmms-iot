import 'dotenv/config';
import mqtt from 'mqtt';
import pino from 'pino';
import { createPool, withTenant } from './db';
import { parseTopic } from './mqtt-topics';
import { TelemetryPayload, toRows } from './telemetry';
import { insertTelemetry } from './db-timescale';
import { loadRules, evalRulesForMetric, upsertRuleStateAndEvent, Rule } from './rules';
import { CHANNEL_STATE, CHANNEL_TELEMETRY, DEFAULT_SUBSCRIPTIONS } from './constants';

const log = pino({ name: 'ingest', level: process.env.LOG_LEVEL || 'info' });
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
  const idNorm = String(deviceIdOrKey).trim();
  const tenantNorm = String(tenantId).trim();

  const client = await pool.connect();
  try {
    return await withTenant(client, tenantNorm, async () => {
      const sql = `
        SELECT d."id", d."assetId"
        FROM public."Device" d
        WHERE d."tenantId" = $1 AND (d."id" = $2 OR d."ingestKey" = $2)
        LIMIT 1`;
      const { rows } = await client.query(sql, [tenantNorm, idNorm]);
      return rows[0] ? { id: rows[0].id, assetId: rows[0].assetId ?? null } : null;
    });
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
      log.error({ err }, 'rules refresh failed');
    } finally {
      setTimeout(run, sec * 1000).unref();
    }
  };
  run();
}

function startMqtt() {
  const url = process.env.MQTT_URL || 'mqtt://mosquitto:1883';
  const username = process.env.MQTT_USERNAME || undefined;
  const password = process.env.MQTT_PASSWORD || undefined;
  const client = mqtt.connect(url, { username, password, keepalive: 30, reconnectPeriod: 2000 });

  client.on('connect', async () => {
    log.info({ url }, 'MQTT connected');
    try {
      const who = await pool.query('SELECT current_user, current_schema();');
      log.info({ dbUser: who.rows[0]?.current_user, schema: who.rows[0]?.current_schema }, 'DB context');
    } catch {}

    const subs = (process.env.MQTT_SUBSCRIPTIONS || DEFAULT_SUBSCRIPTIONS.join(','))
      .split(',').map(s => s.trim()).filter(Boolean);
    for (const s of subs) client.subscribe(s, { qos: 1 }, (err) => err && log.error({ err, s }, 'subscribe error'));
  });

  client.on('reconnect', () => log.warn('MQTT reconnecting...'));
  client.on('error', (err) => log.error({ err }, 'MQTT error'));

  client.on('message', async (topic, payloadBuf) => {
    console.log(topic);
    //console.log(payloadBuf);
    
    
    const p = parseTopic(topic);
    if (!p) return;
    try {
      const payloadStr = payloadBuf.toString('utf8');
      const json = JSON.parse(payloadStr);
      const parsed = TelemetryPayload.parse(json);
      console.log(parsed);
      

      const tenantId = await resolveTenantId(p.tenantSlug);
      if (!tenantId) return log.warn({ topic }, 'unknown tenant');

      const dev = await resolveDevice(tenantId, p.deviceId);
      if (!dev) return log.warn({ topic }, 'unknown device');

      if (p.channel.startsWith(CHANNEL_TELEMETRY)) {
        const rows = toRows(tenantId, dev.id, parsed);
        console.log(rows);
        
        if (rows.length) {
          await insertTelemetry(pool, rows);

          const rules = rulesByTenant.get(tenantId) || [];
          for (const r of rows) {
            if (typeof r.valueDouble === 'number') {
              const events = evalRulesForMetric(rules, tenantId, dev.id, dev.assetId, r.metric, r.ts.getTime(), r.valueDouble);
              for (const ev of events) {
                await upsertRuleStateAndEvent(pool, tenantId, dev.id, dev.assetId, ev.rule.id, ev.rule.severity, ev.newStatus, ev.message);
              }
            }
          }
        }
      } else if (p.channel.startsWith(CHANNEL_STATE)) {
        const clientPg = await pool.connect();
        try {
          await withTenant(clientPg, tenantId, async () => {
            await clientPg.query(
              `UPDATE public."Device" SET "lastSeenAt" = now(), "status"='ACTIVE' WHERE "id"=$1 AND "tenantId"=$2`,
              [dev.id, tenantId]
            );
          });
        } finally {
          clientPg.release();
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