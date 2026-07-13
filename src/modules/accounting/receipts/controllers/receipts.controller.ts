import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { RecordReceiptDto, recordReceiptSchema } from '../../shared/schemas/accounting.schemas';
import { ReceiptsService } from '../services/receipts.service';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';

@Roles('admin', 'accountant', 'treasury')
@Controller('accounting/receipts')
export class ReceiptsController {
  constructor(
    private readonly service: ReceiptsService,
    private readonly logger: PinoLoggerService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) { return this.service.list(user); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) { return this.service.update(id, body, user); }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.remove(id, user); }

  @Post()
  record(
    @Body(new ZodValidationPipe(recordReceiptSchema)) body: RecordReceiptDto,
    @CurrentUser() user: AuthUser,
  ) {
    this.logger.info('Endpoint recordReceipt recibido.', {
      layer: 'controller',
      module: 'receipts',
      action: 'record',
      receiptNo: body.receiptNo,
      legalEntityId: body.legalEntityId,
      payerBpId: body.payerBpId,
      userId: user.sub,
    });
    return this.service.record(body, user);
  }
}
