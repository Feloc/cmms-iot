export class CreateWorkOrderDto {
  title!: string;
  description?: string;
  assetCode!: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: Date | string;
  assignedToUserIds?: string[];
  noticeId?: string;
}
