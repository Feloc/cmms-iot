import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { RulesModule } from './modules/rules/rules.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { NoticesModule } from './modules/notices/notices.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MqttModule } from './modules/mqtt/mqtt.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { ServiceOrdersModule } from './modules/service-orders/service-orders.module';
import { UsersModule } from './modules/users/users.module';
import { PmPlansModule } from './modules/pm-plans/pm-plans.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { DevicesModule } from './modules/devices/devices.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    TelemetryModule,
    RulesModule,
    AssetsModule,
    AlertsModule,
    NoticesModule,
    InventoryModule,
    MqttModule,
    WorkOrdersModule,
    ServiceOrdersModule,
    UsersModule,
    PmPlansModule,
    CatalogModule,
    AttachmentsModule,
    DevicesModule,
    TenantsModule,
    AdminUsersModule,
  ],
})
export class AppModule {}
