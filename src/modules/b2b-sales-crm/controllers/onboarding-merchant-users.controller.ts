import { Body, Controller, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { CreateMerchantUserDto } from '../b2b-sales-crm.dtos';
import { createMerchantUserSchema } from '../b2b-sales-crm.schemas';
import { MerchantUserAccessService } from '../services/onboarding/merchant-user-access.service';
import { requireUpstreamToken } from './onboarding-upstream-token';

/** Usuarios del comercio y su acceso a Atlas: `b2b/onboarding/merchant-users`. */
@Controller('b2b/onboarding')
export class OnboardingMerchantUsersController {
  constructor(private readonly userAccess: MerchantUserAccessService) {}

  /*
   * Registrar al usuario en el CRM Y pedir su acceso a Atlas, en un solo acto.
   *
   * La segunda mitad es la que faltaba: antes esta ruta creaba la membresía y la identidad con la
   * que esa persona inicia sesión se tecleaba aparte, en el portal interno, sin nada que atara una
   * cosa con la otra. Ver `MerchantUserAccessService.createMerchantUser`.
   */
  @Roles('OPERATIONS', 'ADMIN')
  @Post('merchant-users')
  createMerchantUser(
    @Req() req: Request,
    @Body(new ZodValidationPipe(createMerchantUserSchema)) body: CreateMerchantUserDto,
  ): Promise<Record<string, unknown>> {
    return this.userAccess.createMerchantUser(body, requireUpstreamToken(req));
  }

  /**
   * Preguntar a Atlas en qué quedó el acceso pedido y enlazar la identidad si ya se concedió.
   *
   * Es el cierre del circuito: sin esta llamada `user_id` se queda nulo y el alcance del portal del
   * comercio depende del enlace de respaldo por correo.
   */
  @Roles('OPERATIONS', 'ADMIN', 'COMMERCIAL_MANAGER', 'COMMERCIAL_EXECUTIVE')
  @Patch('merchant-users/:merchantUserId/identity')
  syncMerchantUserIdentity(
    @Req() req: Request,
    @Param('merchantUserId') merchantUserId: string,
  ): Promise<Record<string, unknown>> {
    return this.userAccess.syncMerchantUserIdentity(merchantUserId, requireUpstreamToken(req));
  }
}
