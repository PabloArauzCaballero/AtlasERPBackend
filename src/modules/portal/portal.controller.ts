import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-context.types';
import { PORTAL_ROLES } from './portal.constants';
import { PortalScopeService } from './portal.scope.service';
import { PortalMerchantQueryService } from './queries/portal-merchant-query.service';

/**
 * Portal del comercio (usuario partner): quién eres y sobre qué comercios operas.
 *
 * Cada subrecurso vive en su controlador (`portal-plans`, `-billing`, `-invoices`, `-branches`,
 * `-campaigns`) con el mismo prefijo `portal`. `@Roles` solo decide *quién es* el llamador; *qué
 * puede tocar* lo decide siempre `PortalScopeService` a partir de sus membresías reales. Ningún
 * handler pasa un identificador del cliente directamente a la capa de datos.
 */
@Controller('portal')
export class PortalController {
  constructor(
    private readonly scopeService: PortalScopeService,
    private readonly merchant: PortalMerchantQueryService,
  ) {}

  /**
   * Quién eres para el portal, y sobre qué comercios puedes operar.
   *
   * Lo contesta el servidor porque es el único que lo sabe: el navegador se lo guardaba al entrar
   * y podía quedarse en desacuerdo con el token, dejando la pantalla sin salida.
   */
  @Roles(...PORTAL_ROLES)
  @Get('scope')
  async getScope(@CurrentUser() user: AuthUser) {
    return this.merchant.getScope(await this.scopeService.resolveScope(user));
  }
}
