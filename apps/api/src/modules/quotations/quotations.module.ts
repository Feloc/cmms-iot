import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { InventoryModule } from '../inventory/inventory.module';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
@Module({ imports: [InventoryModule], controllers: [QuotationsController], providers: [PrismaService, QuotationsService] })
export class QuotationsModule {}
