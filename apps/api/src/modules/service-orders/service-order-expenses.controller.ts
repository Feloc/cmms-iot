import { Body, Controller, Delete, Get, Param, Patch, Post, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { pipeline } from 'stream/promises';
import type { Response } from 'express';
import { ServiceOrderExpensesService } from './service-order-expenses.service';
import { EXPENSE_RECEIPT_MAX_BYTES, EXPENSE_RECEIPT_MAX_COUNT } from './service-order-expenses.domain';
import type { DispatchDocumentFile } from '../manufacturing/manufacturing-dispatch-files';
import { ServiceOrderExpenseUploadGuard } from './service-order-expense-upload.guard';

@Controller('service-orders/:workOrderId/expenses')
export class ServiceOrderExpensesController {
  constructor(private readonly service: ServiceOrderExpensesService) {}

  @Get()
  list(@Param('workOrderId') orderId: string) { return this.service.list(orderId); }

  @Get('export')
  async export(@Param('workOrderId') orderId: string, @Res() response: Response) {
    const buffer = await this.service.export(orderId);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', 'attachment; filename="gastos-servicio.xlsx"');
    response.send(buffer);
  }

  @Post()
  create(@Param('workOrderId') orderId: string, @Body() body: unknown) { return this.service.create(orderId, body); }

  @Patch(':expenseId')
  update(@Param('workOrderId') orderId: string, @Param('expenseId') expenseId: string, @Body() body: unknown) {
    return this.service.update(orderId, expenseId, body);
  }

  @Post(':expenseId/void')
  void(@Param('workOrderId') orderId: string, @Param('expenseId') expenseId: string, @Body() body: unknown) {
    return this.service.void(orderId, expenseId, body);
  }

  @Post(':expenseId/receipts')
  @UseGuards(ServiceOrderExpenseUploadGuard)
  @UseInterceptors(FilesInterceptor('files', EXPENSE_RECEIPT_MAX_COUNT, {
    storage: memoryStorage(), limits: { fileSize: EXPENSE_RECEIPT_MAX_BYTES, files: EXPENSE_RECEIPT_MAX_COUNT, fields: 0 },
  }))
  receipts(@Param('workOrderId') orderId: string, @Param('expenseId') expenseId: string, @UploadedFiles() files: DispatchDocumentFile[]) {
    return this.service.addReceipts(orderId, expenseId, files);
  }

  @Get(':expenseId/receipts/:receiptId')
  async receipt(@Param('workOrderId') orderId: string, @Param('expenseId') expenseId: string, @Param('receiptId') receiptId: string, @Res() response: Response) {
    const receipt = await this.service.receipt(orderId, expenseId, receiptId);
    try {
      response.setHeader('Content-Type', receipt.mimeType);
      response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(receipt.filename).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16))}`);
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      await pipeline(receipt.handle.createReadStream(), response);
    } finally { await receipt.handle.close().catch(() => undefined); }
  }

  @Delete(':expenseId/receipts/:receiptId')
  removeReceipt(@Param('workOrderId') orderId: string, @Param('expenseId') expenseId: string, @Param('receiptId') receiptId: string) {
    return this.service.removeReceipt(orderId, expenseId, receiptId);
  }
}
