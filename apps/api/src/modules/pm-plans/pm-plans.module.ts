import { Module } from '@nestjs/common';
import { PmPlansController } from './pm-plans.controller';
import { PmPlansService } from './pm-plans.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [PmPlansController],
  providers: [PmPlansService, PrismaService],
})
export class PmPlansModule {}
