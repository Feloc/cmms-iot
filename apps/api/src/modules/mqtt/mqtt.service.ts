import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import mqtt, { MqttClient } from 'mqtt';
import { RulesService } from '../rules/rules.service';
import { PrismaService } from '../../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private client!: MqttClient;
  private readonly logger = new Logger(MqttService.name);

  constructor(
    @Inject(forwardRef(() => RulesService))
    private readonly rules: RulesService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    const url = process.env.MQTT_URL || 'mqtt://localhost:1883';
    this.client = mqtt.connect(url);

    this.client.on('connect', () => {
      this.logger.log(`MQTT conectado: ${url}`);
      // cmms/{tenantSlug}/{assetCode}/{sensorType}
      this.client.subscribe('cmms/+/+/+');
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT error: ${err?.message || err}`);
    });

    this.client.on('message', async (topicBuf, payloadBuf) => {
      const topic = topicBuf.toString();
      const payloadStr = payloadBuf.toString();
      try {
        // --- Topic
        const parts = topic.split('/');
        if (parts.length !== 4 || parts[0] !== 'cmms') {
          this.logger.warn(`Tópico ignorado: ${topic}`);
          return;
        }
        const [, tenantSlug, assetCode, sensorType] = parts;

        // --- Payload
        let payload: any;
        try {
          payload = JSON.parse(payloadStr);
        } catch (e) {
          this.logger.error(
            `Payload JSON inválido (${topic}): ${
              e instanceof Error ? e.message : String(e)
            } — recvd="${payloadStr}"`,
          );
          return;
        }

        const ts = payload?.ts ? new Date(payload.ts) : new Date();
        if (Number.isNaN(ts.getTime())) {
          this.logger.warn(`Timestamp inválido, usando now(): ${payload?.ts}`);
        }

        const value = Number(payload?.value);
        if (!Number.isFinite(value)) {
          this.logger.warn(`Valor inválido en payload: ${payload?.value}`);
          return;
        }

        const meta: Prisma.JsonValue = payload?.meta ?? {};

        // --- Tenant
        const tenant = await this.prisma.tenant.findUnique({
          where: { slug: tenantSlug },
        });
        if (!tenant) {
          this.logger.warn(`Tenant no encontrado para slug="${tenantSlug}"`);
          return;
        }

        // --- Persistir en timeseries.telemetry (hypertable)
        await this.prisma.$executeRaw`
          INSERT INTO timeseries.telemetry (tenant_id, asset_code, sensor_type, ts, value, meta)
          VALUES (${tenant.id}, ${assetCode}, ${sensorType}, ${ts}, ${value}, ${meta})
          ON CONFLICT (tenant_id, asset_code, sensor_type, ts)
          DO UPDATE SET value = EXCLUDED.value, meta = EXCLUDED.meta
        `;

        // --- Evaluar reglas
        await this.rules.evaluateRules(tenant.id, assetCode, sensorType, ts, value);
      } catch (e) {
        const msg = e instanceof Error ? e.stack || e.message : String(e);
        this.logger.error(msg);
      }
    });
  }

  async onModuleDestroy() {
    try {
      if (this.client) {
        this.client.end(true, () => this.logger.log('MQTT desconectado'));
      }
    } catch (e) {
      this.logger.error(
        `Error al cerrar MQTT: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
