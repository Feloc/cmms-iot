import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ServiceOrderExpensesService } from './service-order-expenses.service';

@Injectable()
export class ServiceOrderExpenseUploadGuard implements CanActivate {
  constructor(private readonly service: ServiceOrderExpensesService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    // Resolve ownership before Multer buffers receipt bytes. The transaction checks it again.
    await this.service.authorizeReceiptUpload(request.params.workOrderId, request.params.expenseId);
    return true;
  }
}
