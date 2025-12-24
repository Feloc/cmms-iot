import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PmPlansController } from './pm-plans.controller';
import { PmPlansService } from './pm-plans.service';

@Module({
  controllers: [PmPlansController],
  providers: [PmPlansService, PrismaService],
  exports: [PmPlansService],
})
export class PmPlansModule {}
