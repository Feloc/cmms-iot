import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { RulesService } from '../rules/rules.service';
import { PrismaService } from '../../prisma.service';

@Module({ providers: [MqttService, TelemetryService, RulesService, PrismaService] })
export class MqttModule {}
