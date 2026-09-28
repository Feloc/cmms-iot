import { Module, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import { mkdir } from 'fs/promises';
import { ServiceOrdersController } from './service-orders.controller';
import { ServiceOrdersService } from './service-orders.service';
import { PrismaService } from '../../prisma.service';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ServiceOrderCarryoverService } from './service-order-carryover.service';
import { AfterSalesPartDemandsService } from './after-sales-part-demands.service';
import { ManufacturingQuickService } from '../manufacturing/manufacturing-quick.service';

@Module({
  imports: [InventoryModule, NotificationsModule],
  controllers: [ServiceOrdersController],
  providers: [ServiceOrdersService, ServiceOrderCarryoverService, AfterSalesPartDemandsService, ManufacturingQuickService, PrismaService],
  exports: [ServiceOrderCarryoverService],
})
export class ServiceOrdersModule implements OnModuleInit {
  async onModuleInit() {
    const dir = path.join(process.cwd(), 'uploads', 'tmp');
    await mkdir(dir, { recursive: true });
  }
}
