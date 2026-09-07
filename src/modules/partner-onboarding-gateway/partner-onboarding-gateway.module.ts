import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AtlasPartnerClient } from './atlas-partner.client';
import { MerchantCreditGatewayController } from './merchant-credit-gateway.controller';
import { PartnerOnboardingGatewayController } from './partner-onboarding-gateway.controller';
import { SupportGatewayController } from './support-gateway.controller';

/**
 * Pasarela del expediente del partner hacia AtlasBackend.
 *
 * Módulo propio y no una ruta más del gateway de autenticación: aquél negocia sesiones y maneja
 * cookies de identidad, éste sólo reenvía llamadas de dominio ya autenticadas. Mezclarlos pondría
 * el manejo de credenciales y el del expediente en el mismo archivo, que es como se acaba
 * escribiendo una ruta de negocio que toca una cookie de sesión sin querer.
 */
@Module({
  imports: [HttpModule],
  controllers: [
    PartnerOnboardingGatewayController,
    MerchantCreditGatewayController,
    SupportGatewayController,
  ],
  providers: [AtlasPartnerClient],
})
export class PartnerOnboardingGatewayModule {}
