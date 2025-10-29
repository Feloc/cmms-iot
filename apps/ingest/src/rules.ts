import pino from 'pino';
import type { Pool } from 'pg';

const log = pino({ level: process.env.LOG_LEVEL || 'info', name: 'rules' });

export type Rule = {
  id: string;
  tenantId: string;
  metric: string;
  kind: 'THRESHOLD' | 'ROC' | 'WINDOW_AVG';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  enabled: boolean;
  assetId?: string | null;
  deviceId?: string | null;
  params: any; // { min?, max?, windowSec?, rocLimit?, hysteresis?, cooldownSec? }
};

export type Sample = { ts: number; value: number };

type State = {
  status: 'NORMAL' | 'ALERTING';
  lastChangeAt: number;
  lastVal?: number;
  lastTs?: number;
  window: Sample[]; // para WINDOW_AVG/ROC
};

const states = new Map<string, State>(); // key = `${ruleId}:${deviceId}`

export async function loadRules(pool: Pool): Promise<Rule[]> {
  try {
    const sql = `
      SELECT r."id", r."tenantId", r."metric", r."kind", r."severity", r."enabled",
             r."assetId", r."deviceId", r."params"
      FROM public."Rule" r
      WHERE r."enabled" = true
    `;
    const { rows } = await pool.query(sql);
    return rows.map((r) => ({ ...r, params: r.params || {} }));
  } catch (err: any) {
    // Si la tabla no existe aún (migraciones no aplicadas), no reventar el servicio.
    if (err?.code === '42P01') {
      log.warn('Tabla public."Rule" no existe todavía; reintentaré en el próximo ciclo');
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
  ts: number,
  value: number
) {
  const affected: Rule[] = rules.filter((r) => r.tenantId === tenantId && r.metric === metric &&
    (r.deviceId ? r.deviceId === deviceId : true) &&
    (r.assetId ? r.assetId === assetId : true)
  );
  const events: { rule: Rule; newStatus: 'NORMAL' | 'ALERTING'; message: string }[] = [];
  for (const r of affected) {
    const key = `${r.id}:${deviceId}`;
    const st = states.get(key) || { status: 'NORMAL', lastChangeAt: 0, window: [] } as State;

    const { newStatus, message } = evaluate(r, st, ts, value);

    if (newStatus !== st.status) {
      st.status = newStatus;
      st.lastChangeAt = ts;
      states.set(key, st);
      events.push({ rule: r, newStatus, message });
    } else {
      // actualizar buffer
      st.lastVal = value; st.lastTs = ts;
      states.set(key, st);
    }
  }
  return events;
}

function evaluate(rule: Rule, st: State, ts: number, value: number): { newStatus: State['status']; message: string } {
  const p = rule.params || {};
  const hysteresis = Number(p.hysteresis || 0);
  const cooldownSec = Number(p.cooldownSec || 0);
  const nowSec = Math.floor(ts / 1000);
  const lastChangeSec = Math.floor((st.lastChangeAt || 0) / 1000);
  const inCooldown = cooldownSec > 0 && (nowSec - lastChangeSec) < cooldownSec;

  const ensureWindow = (windowSec: number) => {
    const limitTs = ts - windowSec * 1000;
    st.window = (st.window || []).filter(s => s.ts >= limitTs);
    st.window.push({ ts, value });
  };

  let enter = false, exit = false, msg = '';

  if (rule.kind === 'THRESHOLD') {
    const min = typeof p.min === 'number' ? p.min : -Infinity;
    const max = typeof p.max === 'number' ? p.max : Infinity;
    if (st.status === 'NORMAL') {
      if (value < min || value > max) { enter = true; msg = `THRESHOLD ${value} outside [${min}, ${max}]`; }
    } else {
      // salir con hysteresis
      const minH = min + hysteresis;
      const maxH = max - hysteresis;
      if (value >= minH && value <= maxH) { exit = true; msg = `BACK TO NORMAL ${value} within [${minH}, ${maxH}]`; }
    }
  }

  if (rule.kind === 'ROC') {
    const limit = Number(p.rocLimit || 0);
    if (st.lastTs && st.lastVal !== undefined) {
      const dt = (ts - st.lastTs) / 1000; // s
      if (dt > 0) {
        const roc = (value - st.lastVal) / dt; // units per sec
        if (st.status === 'NORMAL' && Math.abs(roc) > Math.abs(limit)) { enter = true; msg = `ROC ${roc.toFixed(3)} > ${limit}`; }
        if (st.status === 'ALERTING' && Math.abs(roc) <= Math.max(0, Math.abs(limit) - hysteresis)) { exit = true; msg = `ROC back ${roc.toFixed(3)}`; }
      }
    }
  }

  if (rule.kind === 'WINDOW_AVG') {
    const windowSec = Number(p.windowSec || 60);
    const thr = Number(p.max ?? p.min ?? 0);
    ensureWindow(windowSec);
    const avg = st.window.reduce((a, b) => a + b.value, 0) / st.window.length;
    if (st.status === 'NORMAL' && avg > thr) { enter = true; msg = `WINAVG avg=${avg.toFixed(3)} > ${thr}`; }
    if (st.status === 'ALERTING' && avg <= Math.max(0, thr - hysteresis)) { exit = true; msg = `WINAVG back avg=${avg.toFixed(3)}`; }
  }

  st.lastTs = ts; st.lastVal = value;

  if (inCooldown) return { newStatus: st.status, message: `COOLDOWN ${cooldownSec}s` };
  if (enter) return { newStatus: 'ALERTING', message: msg };
  if (exit) return { newStatus: 'NORMAL', message: msg };
  return { newStatus: st.status, message: '' };
}
