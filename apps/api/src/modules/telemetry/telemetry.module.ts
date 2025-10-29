import { Module } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [TelemetryController],
  providers: [TelemetryService, PrismaService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
