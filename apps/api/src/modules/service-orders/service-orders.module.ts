import { Module, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import { mkdir } from 'fs/promises';
import { ServiceOrdersController } from './service-orders.controller';
import { ServiceOrdersService } from './service-orders.service';
import { PrismaService } from '../../prisma.service';
import { InventoryModule } from '../inventory/inventory.module';
import { TelegramNotifierService } from '../notifications/telegram-notifier.service';
import { ServiceOrderCarryoverService } from './service-order-carryover.service';

@Module({
  imports: [InventoryModule],
  controllers: [ServiceOrdersController],
  providers: [ServiceOrdersService, ServiceOrderCarryoverService, PrismaService, TelegramNotifierService],
  exports: [ServiceOrderCarryoverService],
})
export class ServiceOrdersModule implements OnModuleInit {
  async onModuleInit() {
    const dir = path.join(process.cwd(), 'uploads', 'tmp');
    await mkdir(dir, { recursive: true });
  }
}
