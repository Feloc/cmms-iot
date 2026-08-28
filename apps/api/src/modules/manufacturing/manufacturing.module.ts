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
import { ManufacturingSupplyController } from './manufacturing-supply.controller';
import { ManufacturingSupplyService } from './manufacturing-supply.service';
import { ManufacturingStockReservationsService } from './manufacturing-stock-reservations.service';
import { ManufacturingSupplyRequestsService } from './manufacturing-supply-requests.service';
import { ManufacturingSupplyInspectionsService } from './manufacturing-supply-inspections.service';
import { ManufacturingKitsService } from './manufacturing-kits.service';
import { ManufacturingAssemblyController } from './manufacturing-assembly.controller';
import { ManufacturingAssemblyService } from './manufacturing-assembly.service';
import { ManufacturingFatController } from './manufacturing-fat.controller';
import { ManufacturingFatService } from './manufacturing-fat.service';
import { ManufacturingDispatchController } from './manufacturing-dispatch.controller';
import { ManufacturingDispatchService } from './manufacturing-dispatch.service';

@Module({
  controllers: [ManufacturingController, ManufacturingDocumentsController, ManufacturingBomsController, ManufacturingReleasesController, ManufacturingSupplyController, ManufacturingAssemblyController, ManufacturingFatController, ManufacturingDispatchController],
  providers: [ManufacturingService, ManufacturingDocumentsService, ManufacturingBomsService, ManufacturingBomImportService, ManufacturingReleasesService, ManufacturingSupplyService, ManufacturingStockReservationsService, ManufacturingSupplyRequestsService, ManufacturingSupplyInspectionsService, ManufacturingKitsService, ManufacturingAssemblyService, ManufacturingFatService, ManufacturingDispatchService, PrismaService],
})
export class ManufacturingModule {}
