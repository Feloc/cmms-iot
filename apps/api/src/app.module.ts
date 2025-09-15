import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { RulesModule } from './modules/rules/rules.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { NoticesModule } from './modules/notices/notices.module';
import { WorkordersModule } from './modules/workorders/workorders.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MqttModule } from './modules/mqtt/mqtt.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, TelemetryModule, RulesModule, AssetsModule, AlertsModule, NoticesModule, WorkordersModule, InventoryModule, MqttModule, WorkOrdersModule],
})
export class AppModule {}
