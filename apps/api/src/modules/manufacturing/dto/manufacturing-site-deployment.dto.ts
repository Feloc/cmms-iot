export class ManufacturingSiteDeploymentVersionDto {
  lockVersion!: number;
}

export class UpdateManufacturingSiteReceiptCheckDto extends ManufacturingSiteDeploymentVersionDto {
  status!: 'PENDING' | 'PASSED' | 'FAILED' | 'NOT_APPLICABLE';
  evidenceReference?: string | null;
  notes?: string | null;
}

export class CompleteManufacturingSiteReceiptDto extends ManufacturingSiteDeploymentVersionDto {
  decision!: 'ACCEPTED' | 'ACCEPTED_WITH_OBSERVATIONS' | 'BLOCKED';
  receivedByName!: string;
  evidenceReference!: string;
  notes?: string | null;
}

export class CreateManufacturingSiteInstallationDto extends ManufacturingSiteDeploymentVersionDto {
  templateId!: string;
  assetCode?: string;
  assetName?: string;
  customer?: string;
  title?: string;
  description?: string;
  scheduledStartAt!: string | Date;
  scheduleTimezone?: string;
  workdayStartMinute?: number;
  workdayEndMinute?: number;
  workingDays?: number[];
  excludedDates?: string[];
  technicianIds?: string[];
}
