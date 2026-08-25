import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { PortalScopeService } from '../../portal/portal.scope.service';
import type { RegisterPurchaseDto } from '../b2b-sales-crm.dtos';
import { registerPurchaseSchema } from '../b2b-sales-crm.schemas';
import { B2BSalesCrmService } from '../services/b2b-sales-crm.service';

@Controller('b2b/bnpl')
export class BnplController {
  constructor(
    private readonly service: B2BSalesCrmService,
    private readonly scope: PortalScopeService,
  ) {}

  @Roles('MERCHANT_ADMIN', 'OPERATIONS', 'ADMIN')
  @Post('purchases')
  async registerPurchase(
    @Body(new ZodValidationPipe(registerPurchaseSchema)) body: RegisterPurchaseDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Record<string, unknown>> {
    return this.service.registerPurchase({
      ...body,
      merchantAccountId: await this.resolveMerchantAccountId(body.merchantAccountId, user),
    });
  }

  /**
   * Sobre QUE comercio se registra la compra.
   *
   * Antes salia del cuerpo sin comprobar nada, y el endpoint acepta `MERCHANT_ADMIN`: un comercio
   * podia mandar la cuenta de OTRO y registrarle compras. Ahora el comercio no la manda —la deriva
   * su membresia— y si la manda tiene que ser una de las suyas. El operador interno sigue
   * eligiendo, que es su trabajo, y eso queda auditado como acceso delegado.
   */
  private async resolveMerchantAccountId(
    solicitada: string | undefined,
    user: AuthUser,
  ): Promise<string> {
    const scope = await this.scope.resolveScope(user);

    if (scope.isInternalOperator) {
      if (!solicitada) {
        throw new ForbiddenException('Indique sobre que comercio se registra la compra.');
      }
      return solicitada;
    }

    if (solicitada && !scope.accountIds.includes(solicitada)) {
      throw new ForbiddenException('No puede registrar compras de otro comercio.');
    }

    const propia = solicitada ?? scope.accountIds[0];
    if (!propia) {
      throw new ForbiddenException('Su usuario no tiene un comercio asignado.');
    }
    return propia;
  }
}
