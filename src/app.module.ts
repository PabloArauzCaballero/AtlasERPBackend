import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule as NestPinoLoggerModule } from 'nestjs-pino';
import { env } from './config/env';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ObservabilityModule } from './common/observability/observability.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { LoggerModule as AccountingLoggerModule } from './common/logger/logger.module';
import { PinoLoggerModule } from './common/logging/pino-logger.module';
import { DatabaseModule } from './database/sequelize.module';
import { HealthModule } from './modules/health/health.module';
import { AuthGatewayModule } from './modules/auth-gateway/auth-gateway.module';
import { PartnerOnboardingGatewayModule } from './modules/partner-onboarding-gateway/partner-onboarding-gateway.module';
import { B2BSalesCrmModule } from './modules/b2b-sales-crm/b2b-sales-crm.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AdsModule } from './modules/ads/ads.module';
import { FilesModule } from './modules/files/files.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { PortalModule } from './modules/portal/portal.module';
import { BusinessActionLogsModule } from './modules/business-action-logs/business-action-logs.module';
import { PlatformCatalogModule } from './modules/platform-catalog/platform-catalog.module';

/**
 * ¿Está instalado `pino-pretty`?
 *
 * El transporte bonito es una comodidad de desarrollo y vive en `devDependencies`. La imagen de
 * producción se construye con `npm ci --omit=dev`, así que ahí NO existe — y pino, al no poder
 * resolver el target, lanza «unable to determine transport target» **durante la construcción del
 * módulo**: Nest no llega a levantar y el contenedor muere al arrancar, con un error que no menciona
 * ni los logs ni las dependencias.
 *
 * Aparecía en cuanto se corría esa imagen con un `.env` de desarrollo, que es exactamente lo que
 * hace el auto-despliegue local de esta máquina. Comprobarlo convierte un arranque imposible en una
 * degradación: sin el paquete, los logs salen en JSON, que es lo que un contenedor debe emitir.
 */
function prettyDisponible(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ObservabilityModule,
    PinoLoggerModule,
    AccountingLoggerModule,
    NestPinoLoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            'req.body.password',
            'req.body.token',
            'req.body.accessToken',
            'req.body.refreshToken',
            'authorization',
            'cookie',
            'password',
            'token',
            'accessToken',
            'refreshToken',
          ],
          censor: '[REDACTED]',
        },
        ...(env.NODE_ENV === 'development' && prettyDisponible()
          ? { transport: { target: 'pino-pretty' } }
          : {}),
      },
    }),
    JwtModule.register({
      secret: env.JWT_INTERNAL_SECRET,
      signOptions: { issuer: env.JWT_INTERNAL_ISSUER, audience: env.JWT_INTERNAL_AUDIENCE },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    HealthModule,
    AuthGatewayModule,
    PartnerOnboardingGatewayModule,
    B2BSalesCrmModule,
    AccountingModule,
    AdsModule,
    FilesModule,
    DocumentsModule,
    PortalModule,
    BusinessActionLogsModule,
    // Espejo de introspección para el catálogo unificado del portal interno de ATLAS. Va al
    // final a propósito: lee el router ya montado y no participa en él.
    PlatformCatalogModule,
  ],
  providers: [
    HttpExceptionFilter,
    LoggingInterceptor,
    ResponseInterceptor,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
