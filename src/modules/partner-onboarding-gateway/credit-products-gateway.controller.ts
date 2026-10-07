import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AtlasPartnerClient } from './atlas-partner.client';

/** La MISMA cookie que emite el gateway de autenticacion; aqui solo se lee. */
const UPSTREAM_ACCESS_COOKIE = 'atlas_upstream_at';

/**
 * Los productos de crédito que Atlas ofrece, configurables desde el ERP.
 *
 * Existían sólo en el portal interno. Una compra pide el crédito por la parte FINANCIADA (el 40 %) y la app
 * elige un producto activo cuyo rango la admita; sin ninguno responde `NO_PRODUCT_FOR_AMOUNT` y la venta se queda
 * en la puerta. En un entorno limpio (TEST) no existía ninguno y quien tenía que crearlo no encontraba dónde:
 * Pablo probó una compra de Bs 200 (financia Bs 80) y no pasaba (2026-10-07).
 *
 * Reenvío fino hacia AtlasBackend (`operations/credit/products`), con el token del ACTOR: es el Core quien
 * exige el rol interno y quien valida los rangos, el código único y las transiciones de estado. Aquí no se
 * opina del dominio. No hay ruta para BORRAR ni para editar montos, porque el Core no las ofrece: un producto con
 * solicitudes colgando se suspende o se retira, y uno equivocado se sustituye por otro.
 */
@Controller('credit-products')
export class CreditProductsGatewayController {
  constructor(private readonly client: AtlasPartnerClient) {}

  /** Todos los productos, también los borradores y suspendidos: la pantalla sirve justo para activarlos. */
  @Get()
  @Roles('OPERATIONS', 'ADMIN')
  list(@Req() req: Request) {
    return this.client.forward({
      method: 'GET',
      path: 'operations/credit/products',
      accessToken: this.token(req),
    });
  }

  /** Crea un producto. Nace en borrador: activarlo es una decisión aparte. */
  @Post()
  @Roles('OPERATIONS', 'ADMIN')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.client.forward({
      method: 'POST',
      path: 'operations/credit/products',
      accessToken: this.token(req),
      body,
    });
  }

  /** Activar, suspender o retirar. El cuerpo es `{ status, reasonCode }`; el Core valida la transición. */
  @Patch(':productId/status')
  @Roles('OPERATIONS', 'ADMIN')
  changeStatus(@Req() req: Request, @Param('productId') productId: string, @Body() body: unknown) {
    return this.client.forward({
      method: 'PATCH',
      path: `operations/credit/products/${encodeURIComponent(productId)}/status`,
      accessToken: this.token(req),
      body,
    });
  }

  private token(req: Request): string | undefined {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[UPSTREAM_ACCESS_COOKIE];
  }
}
