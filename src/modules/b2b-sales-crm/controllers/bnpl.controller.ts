import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { RegisterPurchaseDto } from '../b2b-sales-crm.dtos';
import { registerPurchaseSchema } from '../b2b-sales-crm.schemas';
import { B2BSalesCrmService } from '../services/b2b-sales-crm.service';

@Controller('b2b/bnpl')
export class BnplController {
  constructor(private readonly service: B2BSalesCrmService) {}

  @Roles('MERCHANT_ADMIN', 'OPERATIONS', 'ADMIN')
  @Post('purchases')
  registerPurchase(
    @Body(new ZodValidationPipe(registerPurchaseSchema)) body: RegisterPurchaseDto,
  ): Promise<Record<string, unknown>> {
    return this.service.registerPurchase(body);
  }
}
