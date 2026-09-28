import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { TenantAdminGuard } from '../../common/guards/tenant-admin.guard';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramPollingService } from './telegram-polling.service';
import { TelegramWorkerService } from './telegram-worker.service';
import { TelegramNotifierService } from './telegram-notifier.service';

@Module({
  controllers: [TelegramController],
  providers: [PrismaService, TenantAdminGuard, TelegramService, TelegramPollingService, TelegramWorkerService, TelegramNotifierService],
  exports: [TelegramService, TelegramNotifierService],
})
export class NotificationsModule {}
