import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { env } from '../../config/env';
import { AccessTokenIssuerService } from './access-token-issuer.service';
import { AtlasIdentityClient } from './atlas-identity.client';
import { AuthGatewayController } from './auth-gateway.controller';
import { AuthGatewayService } from './auth-gateway.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: () => ({ timeout: env.ATLAS_IDENTITY_TIMEOUT_MS, maxRedirects: 0 }),
    }),
  ],
  controllers: [AuthGatewayController],
  providers: [AuthGatewayService, AtlasIdentityClient, AccessTokenIssuerService],
  /*
   * `AtlasIdentityClient` sale del módulo para que el CRM pueda ENCOLAR en Atlas el alta de
   * identidad del usuario de comercio que acaba de registrar. No se exporta `AuthGatewayService`:
   * ése maneja sesiones y rotación de tokens, y nadie fuera de la puerta de entrada tiene por qué
   * poder emitirlas.
   */
  exports: [AtlasIdentityClient],
})
export class AuthGatewayModule {}
