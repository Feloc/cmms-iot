import { Module } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersController } from './work-orders.controller';
import { PrismaService } from '../../prisma.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { WorkOrderAttachmentsController } from './work-orders.attachments.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [InventoryModule, NotificationsModule],
  controllers: [WorkOrdersController, WorkOrderAttachmentsController],
  providers: [WorkOrdersService, PrismaService, AttachmentsService],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
