export class UpdateWorkOrderDto {
  title?: string;
  description?: string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELED';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: Date | string;
  startedAt?: Date | string;
  completedAt?: Date | string;
  assignedToUserIds?: string[];
}
