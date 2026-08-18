import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ManufacturingController } from './manufacturing.controller';
import { ManufacturingService } from './manufacturing.service';
import { ManufacturingDocumentsController } from './manufacturing-documents.controller';
import { ManufacturingDocumentsService } from './manufacturing-documents.service';

@Module({
  controllers: [ManufacturingController, ManufacturingDocumentsController],
  providers: [ManufacturingService, ManufacturingDocumentsService, PrismaService],
})
export class ManufacturingModule {}
