import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { Prisma } from '@prisma/client';

type Operator = '>' | '>=' | '<' | '<=' | '==' | '!=';

@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evalúa todas las reglas activas para (tenant, asset, sensor) dado el punto recibido.
   *
   * @param tenantId  ID del tenant (no slug)
   * @param assetCode Código del activo (ej. "pump-001")
   * @param sensor    Tipo de sensor (ej. "temp")
   * @param ts        Timestamp de la muestra
   * @param value     Valor de la muestra
   */
  async evaluateRules(
    tenantId: string,
    assetCode: string,
    sensor: string,
    ts: Date,
    value: number,
  ) {
    // 1) Cargar reglas activas para ese asset/sensor/tenant
    const rules = await this.prisma.rule.findMany({
      where: { tenantId, assetCode, sensor, enabled: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!rules.length) return;

    for (const rule of rules) {
      try {
        if (rule.kind === 'THRESHOLD') {
          await this.checkThreshold(rule as any, tenantId, assetCode, sensor, ts, value);
        } else if (rule.kind === 'ROC') {
          await this.checkRoc(rule as any, tenantId, assetCode, sensor, ts, value);
        }
      } catch (err) {
        this.logger.error(
          `Error evaluando regla ${rule.id} (${rule.kind}) ${assetCode}/${sensor}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  // -----------------------
  // THRESHOLD
  // -----------------------
  private async checkThreshold(
    rule: {
      id: string;
      operator?: Operator; // '>' | '<' | '>=' | '<=' | '==' | '!='
      threshold?: number;  // valor a comparar
      message?: string;
      severity?: string;
    },
    tenantId: string,
    assetCode: string,
    sensor: string,
    ts: Date,
    value: number,
  ) {
    const op: Operator = (rule.operator as Operator) ?? '>';
    const threshold = Number(rule.threshold);
    if (!Number.isFinite(threshold)) return;

    const fired = this.compare(op, value, threshold);
    if (!fired) return;

    const msg =
      rule.message ||
      `[THRESHOLD] ${assetCode}/${sensor} – ${sensor} ${op} ${threshold}: ${value} @ ${ts.toISOString()}`;

    await this.createAlertAndNotice({
      tenantId,
      ruleId: rule.id,
      assetCode,
      sensor,
      ts,
      value,
      delta: null,
      kind: 'THRESHOLD',
      message: msg,
      severity: rule.severity ?? 'MEDIUM',
    });
  }

  // -----------------------
  // ROC (Rate of Change)
  // -----------------------
  private async checkRoc(
    rule: {
      id: string;
      operator?: Operator;   // default '>'
      rocDelta?: number;     // umbral de Δ
      delta?: number;        // alias
      threshold?: number;    // alias (si lo usaste así)
      absolute?: boolean;    // default true (usa |Δ|) — si false, usa delta con signo
      rocWindowSec?: number; // ventana para buscar la muestra previa (default 300s)
      windowSec?: number;    // alias
      message?: string;
      severity?: string;
    },
    tenantId: string,
    assetCode: string,
    sensor: string,
    ts: Date,
    value: number,
  ) {
    const op: Operator = (rule.operator as Operator) ?? '>';
    const limit = this.firstNumber(rule.rocDelta, rule.delta, rule.threshold, 0);
    const useAbs = rule.absolute !== false; // default: true
    const windowSec = this.firstNumber(rule.rocWindowSec, rule.windowSec, 300);

    // Trae 2 muestras en la ventana [ts-window, ts] (ts incluida), ordenadas DESC
    const since = new Date(ts.getTime() - windowSec * 1000);

    const series = await this.prisma.$queryRaw<Array<{ ts: Date; value: number }>>`
      SELECT ts, value
      FROM timeseries.telemetry
      WHERE tenant_id = ${tenantId}
        AND asset_code = ${assetCode}
        AND sensor_type = ${sensor}
        AND ts >= ${since}
        AND ts <= ${ts}
      ORDER BY ts DESC
      LIMIT 2
    `;

    if (series.length < 2) return;

    const latest = Number(series[0].value);
    const prev = Number(series[1].value);

    if (!Number.isFinite(latest) || !Number.isFinite(prev)) return;

    const delta = latest - prev;
    const cmpLeft = useAbs ? Math.abs(delta) : delta;

    const fired = this.compare(op, cmpLeft, limit);
    if (!fired) return;

    const humanDelta = (useAbs ? Math.abs(delta) : delta).toFixed(2);
    const msg =
      rule.message ||
      `[ROC] ${assetCode}/${sensor} – ROC ${sensor} Δ${op}${limit}: ${humanDelta} @ ${ts.toISOString()}`;

    await this.createAlertAndNotice({
      tenantId,
      ruleId: rule.id,
      assetCode,
      sensor,
      ts,
      value,
      delta,
      kind: 'ROC',
      message: msg,
      severity: rule.severity ?? 'HIGH',
    });
  }

  // -----------------------
  // Helpers
  // -----------------------
  private compare(op: Operator, left: number, right: number): boolean {
    switch (op) {
      case '>': return left > right;
      case '>=': return left >= right;
      case '<': return left < right;
      case '<=': return left <= right;
      case '==': return left === right;
      case '!=': return left !== right;
      default: return false;
    }
  }

  private firstNumber(...vals: Array<number | null | undefined>): number {
    for (const v of vals) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  /**
   * Crea Alert y (opcional) Notice. Resistente a diferencias de esquema:
   * - Intenta llenar campos comunes; si algún campo no existe, registra un warning y sigue.
   */
  private async createAlertAndNotice(params: {
    tenantId: string;
    ruleId: string;
    assetCode: string;
    sensor: string;
    ts: Date;
    value: number;
    delta: number | null;
    kind: 'THRESHOLD' | 'ROC';
    message: string;
    severity?: string;
  }) {
    const { tenantId, ruleId, assetCode, sensor, ts, value, delta, kind, message, severity } = params;

    // ALERT
    try {
      // Ajusta los nombres de campos a tu prisma.schema:
      // tenantId, ruleId, assetCode, sensor, kind, message, value, delta, ts, status, severity
      await this.prisma.alert.create({
        data: {
          tenantId,
          ruleId,
          assetCode,
          sensor,
          kind: kind as any,
          message,
          value,
          // @ts-ignore por si tu modelo no tiene delta/ts/severity:
          delta,
          // @ts-ignore
          ts,
          status: 'OPEN',
          // @ts-ignore
          severity: severity ?? 'MEDIUM',
        } as any,
      });
    } catch (e) {
      this.logger.warn(
        `No se pudo crear Alert (ajusta campos del modelo si difieren): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }

    // NOTICE (opcional)
    try {
      // Campos mínimos plausibles; ajusta según tu schema:
      await this.prisma.notice.create({
        data: {
          tenantId,
          title: message,
          status: 'OPEN',
          // Si tienes relación con un Asset por id, aquí necesitarías resolver el id por code.
          // En muchos MVP guardamos code directo:
          // @ts-ignore
          assetCode,
          // @ts-ignore
          source: 'RULE',
        } as any,
      });
    } catch (e) {
      this.logger.warn(
        `No se pudo crear Notice (ajusta campos del modelo si difieren): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
}
