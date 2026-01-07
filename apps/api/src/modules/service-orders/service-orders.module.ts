import { Module, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import { mkdir } from 'fs/promises';
import { ServiceOrdersController } from './service-orders.controller';
import { ServiceOrdersService } from './service-orders.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [ServiceOrdersController],
  providers: [ServiceOrdersService, PrismaService],
})
export class ServiceOrdersModule implements OnModuleInit {
  async onModuleInit() {
    const dir = path.join(process.cwd(), 'uploads', 'tmp');
    await mkdir(dir, { recursive: true });
  }
}
