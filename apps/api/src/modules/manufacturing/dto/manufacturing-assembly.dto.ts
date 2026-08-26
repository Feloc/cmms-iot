export class CreateManufacturingAssemblyExecutionDto { templateId!: string; }
export class UpdateManufacturingAssemblyOperationDto { lockVersion!: number; assignedUserId?: string | null; notes?: string | null; }
export class ManufacturingAssemblyOperationActionDto { lockVersion!: number; reason?: string | null; notes?: string | null; }
export class StartManufacturingAssemblyTimeDto { note?: string | null; }
export class StopManufacturingAssemblyTimeDto { note?: string | null; }
export class CreateManufacturingAssemblyEvidenceDto { title!: string; reference?: string | null; url?: string | null; notes?: string | null; }
export class CreateManufacturingAssemblyConsumptionDto { kitLineId!: string; quantity!: number | string; notes?: string | null; }
