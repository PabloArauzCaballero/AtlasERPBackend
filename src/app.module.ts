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
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { LoggerModule as AccountingLoggerModule } from './common/logger/logger.module';
import { PinoLoggerModule } from './common/logging/pino-logger.module';
import { DatabaseModule } from './database/sequelize.module';
import { HealthModule } from './modules/health/health.module';
import { AuthGatewayModule } from './modules/auth-gateway/auth-gateway.module';
import { B2BSalesCrmModule } from './modules/b2b-sales-crm/b2b-sales-crm.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AdsModule } from './modules/ads/ads.module';
import { FilesModule } from './modules/files/files.module';
import { PortalModule } from './modules/portal/portal.module';
import { BusinessActionLogsModule } from './modules/business-action-logs/business-action-logs.module';
import { PlatformCatalogModule } from './modules/platform-catalog/platform-catalog.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
        ...(env.LOG_PRETTY ? { transport: { target: 'pino-pretty' } } : {}),
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
    B2BSalesCrmModule,
    AccountingModule,
    AdsModule,
    FilesModule,
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
