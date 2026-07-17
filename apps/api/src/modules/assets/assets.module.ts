import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { AssetsImportController } from './assets.import.controller';
import { AssetsImportService } from './assets.import.service';
import { PrismaService } from '../../prisma.service';
import { ServiceOrderCarryoverService } from '../service-orders/service-order-carryover.service';


@Module({
controllers: [AssetsController, AssetsImportController],
providers: [AssetsService, AssetsImportService, ServiceOrderCarryoverService, PrismaService],
exports: [AssetsService],
})
export class AssetsModule {}
