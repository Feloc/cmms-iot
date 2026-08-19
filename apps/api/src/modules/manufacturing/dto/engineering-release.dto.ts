export class CreateEngineeringReleaseDto {
  releaseCode!: string;
  title!: string;
  notes?: string | null;
  bomRevisionId!: string;
  documentRevisionIds?: string[];
}

export class UpdateEngineeringReleaseDto {
  lockVersion!: number;
  title?: string;
  notes?: string | null;
  bomRevisionId?: string;
  documentRevisionIds?: string[];
}

export class PublishEngineeringReleaseDto {
  lockVersion!: number;
  notes?: string | null;
}
