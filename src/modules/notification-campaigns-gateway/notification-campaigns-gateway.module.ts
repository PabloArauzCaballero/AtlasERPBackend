import { Module } from '@nestjs/common';
import { PartnerOnboardingGatewayModule } from '../partner-onboarding-gateway/partner-onboarding-gateway.module';
import { NotificationCampaignsGatewayController } from './notification-campaigns-gateway.controller';

/**
 * Pasarela de campañas de notificación hacia AtlasBackend.
 *
 * Reutiliza `AtlasPartnerClient` —el cliente con el token del actor y la traducción de errores— en
 * vez de escribir otro: dos clientes hacia el mismo servicio acaban tratando distinto el mismo 401.
 */
@Module({
  imports: [PartnerOnboardingGatewayModule],
  controllers: [NotificationCampaignsGatewayController],
})
export class NotificationCampaignsGatewayModule {}
