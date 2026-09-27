import { Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthUser } from '../../../common/types/auth-context.types';
import { MerchantBillingCycleService } from '../billing-cycle/merchant-billing-cycle.service';

/** Cierre de facturación de comercios: consultar corridas y lanzar la del ciclo cerrado a mano. */
@Controller('b2b/billing/runs')
export class BillingRunsController {
  constructor(private readonly service: MerchantBillingCycleService) {}

  @Roles('FINANCE', 'ADMIN')
  @Get()
  list() {
    return this.service.listar();
  }

  /** Factura el último mes cerrado si todavía no se facturó (idempotente por ciclo). */
  @Roles('FINANCE', 'ADMIN')
  @Post()
  run(@CurrentUser() user: AuthUser) {
    return this.service.ejecutar({ trigger: 'MANUAL', requestedBy: user.sub });
  }
}
