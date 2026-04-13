import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../prisma.service';
import { InventoryImportController } from './inventory.import.controller';
import { InventoryImportService } from './inventory.import.service';
import { InventoryLedgerService } from './inventory-ledger.service';
import { InventoryManualsService } from './inventory-manuals.service';

@Module({
  controllers: [InventoryController, InventoryImportController],
  providers: [InventoryService, InventoryImportService, InventoryLedgerService, InventoryManualsService, PrismaService],
  exports: [InventoryLedgerService],
})
export class InventoryModule {}
