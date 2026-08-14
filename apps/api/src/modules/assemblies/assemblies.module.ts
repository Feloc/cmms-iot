import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AssembliesController } from './assemblies.controller';
import { AssembliesService } from './assemblies.service';

@Module({
  controllers: [AssembliesController],
  providers: [AssembliesService, PrismaService],
})
export class AssembliesModule {}

