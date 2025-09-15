import { Module } from '@nestjs/common';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [NoticesController],
  providers: [NoticesService, PrismaService],
  exports: [NoticesService],
})
export class NoticesModule {}
