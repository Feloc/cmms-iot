import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import mqtt, { MqttClient } from 'mqtt';
import { TelemetryService } from '../telemetry/telemetry.service';
import { RulesService } from '../rules/rules.service';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class MqttService implements OnModuleInit {
  private client!: MqttClient;
  private readonly logger = new Logger(MqttService.name);
  constructor(private telem: TelemetryService, private rules: RulesService, private prisma: PrismaService) {}

  async onModuleInit() {
    const url = process.env.MQTT_URL || 'mqtt://localhost:1883';
    this.client = mqtt.connect(url);
    this.client.on('connect', () => {
      this.logger.log(`MQTT conectado ${url}`);
      this.client.subscribe('cmms/+/+/+');
    });

    this.client.on('message', async (topic, message) => {
      try {
        const [_, tenantSlug, assetCode, sensor] = topic.toString().split('/');
        const payload = JSON.parse(message.toString());
        const ts = payload.ts ? new Date(payload.ts) : new Date();
        const value = Number(payload.value);
        const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
        if (!tenant) return;
        await this.telem.insertTelemetry(tenant.id, assetCode, sensor, ts, value, payload.meta || {});
        await this.rules.evaluateRules(tenant.id, assetCode, sensor, ts, value);
      } catch (e) { this.logger.error(e as any); }
    });
  }
}
