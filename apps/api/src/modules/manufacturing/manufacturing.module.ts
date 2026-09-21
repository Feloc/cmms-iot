import { ManufacturingControlService } from './manufacturing-control.service';
import { ManufacturingControlController } from './manufacturing-control.controller';
import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ManufacturingController } from './manufacturing.controller';
import { ManufacturingAccessGuard } from './manufacturing-access.guard';
import { ManufacturingValidationPipe } from './manufacturing-validation.pipe';
import { ManufacturingService } from './manufacturing.service';
import { ManufacturingQuickService } from './manufacturing-quick.service';
import { ManufacturingQuickController } from './manufacturing-quick.controller';
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
import { AssembliesModule } from '../assemblies/assemblies.module';
import { ManufacturingSiteDeploymentController } from './manufacturing-site-deployment.controller';
import { ManufacturingSiteDeploymentService } from './manufacturing-site-deployment.service';
import { ManufacturingSatController } from './manufacturing-sat.controller';
import { ManufacturingSatService } from './manufacturing-sat.service';
import { ManufacturingHandoverController } from './manufacturing-handover.controller';
import { ManufacturingHandoverService } from './manufacturing-handover.service';

@Module({
  imports: [AssembliesModule],
  controllers: [ManufacturingControlController, ManufacturingQuickController, ManufacturingController, ManufacturingDocumentsController, ManufacturingBomsController, ManufacturingReleasesController, ManufacturingSupplyController, ManufacturingAssemblyController, ManufacturingFatController, ManufacturingDispatchController, ManufacturingSiteDeploymentController, ManufacturingSatController, ManufacturingHandoverController],
  providers: [ManufacturingControlService, ManufacturingAccessGuard, ManufacturingValidationPipe, ManufacturingQuickService, ManufacturingService, ManufacturingDocumentsService, ManufacturingBomsService, ManufacturingBomImportService, ManufacturingReleasesService, ManufacturingSupplyService, ManufacturingStockReservationsService, ManufacturingSupplyRequestsService, ManufacturingSupplyInspectionsService, ManufacturingKitsService, ManufacturingAssemblyService, ManufacturingFatService, ManufacturingDispatchService, ManufacturingSiteDeploymentService, ManufacturingSatService, ManufacturingHandoverService, PrismaService],
})
export class ManufacturingModule {}
