import { Module } from '@nestjs/common';
import { ServiceOrdersController } from './service-orders.controller';
import { ServiceOrdersService } from './service-orders.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [ServiceOrdersController],
  providers: [ServiceOrdersService, PrismaService],
})
export class ServiceOrdersModule {}
