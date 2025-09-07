import { Module } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { TelemetryController } from './telemetry.controller';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [TelemetryController],
  providers: [TelemetryService, PrismaService],
  exports: [TelemetryService]
})
export class TelemetryModule {}
