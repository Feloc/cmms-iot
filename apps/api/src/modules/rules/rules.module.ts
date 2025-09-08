import { Module } from '@nestjs/common';
import { RulesService } from './rules.service';
import { PrismaService } from '../../prisma.service';

@Module({
  imports: [],
  providers: [RulesService, PrismaService],
  exports: [RulesService],
})
export class RulesModule {}
