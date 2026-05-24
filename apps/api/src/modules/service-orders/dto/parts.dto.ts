export class AddServiceOrderPartDto {
  inventoryItemId?: string;
  freeText?: string;
  qty?: number;
  notes?: string;
}

export class UpdateServiceOrderPartDto {
  notes?: string | null;
}
