import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ManufacturingController } from './manufacturing.controller';
import { ManufacturingService } from './manufacturing.service';
import { ManufacturingDocumentsController } from './manufacturing-documents.controller';
import { ManufacturingDocumentsService } from './manufacturing-documents.service';
import { ManufacturingBomsController } from './manufacturing-boms.controller';
import { ManufacturingBomsService } from './manufacturing-boms.service';
import { ManufacturingBomImportService } from './manufacturing-bom-import.service';
import { ManufacturingReleasesController } from './manufacturing-releases.controller';
import { ManufacturingReleasesService } from './manufacturing-releases.service';

@Module({
  controllers: [ManufacturingController, ManufacturingDocumentsController, ManufacturingBomsController, ManufacturingReleasesController],
  providers: [ManufacturingService, ManufacturingDocumentsService, ManufacturingBomsService, ManufacturingBomImportService, ManufacturingReleasesService, PrismaService],
})
export class ManufacturingModule {}
