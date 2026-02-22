import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../prisma.service';
import { InventoryImportController } from './inventory.import.controller';
import { InventoryImportService } from './inventory.import.service';

@Module({
  controllers: [InventoryController, InventoryImportController],
  providers: [InventoryService, InventoryImportService, PrismaService],
})
export class InventoryModule {}
