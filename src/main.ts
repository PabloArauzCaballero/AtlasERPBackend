import 'reflect-metadata';
// Debe preceder a TODO import instrumentable (Nest, Express, Sequelize, pg, axios, undici): las
// instrumentaciones de OpenTelemetry parchean esos módulos en el instante en que se requieren,
// así que arrancar después produce cero spans y ningún error que lo explique. Es no-op salvo
// OTEL_ENABLED=true. El nombre por defecto es POR PROCESO: si la API y el worker compartieran
// uno, el grafo de dependencias de Jaeger mostraría un solo nodo hablando consigo mismo.
import { startTracing, stopTracing } from './observability/tracing';

startTracing('atlas-erp-api');

import { json, urlencoded } from 'express';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { Logger as NestPinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { env } from './config/env';
import { buildCorsOptions } from './config/cors.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { TraceResponseInterceptor } from './common/observability/trace-response.interceptor';
import { PinoLoggerService } from './common/logging/pino-logger.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(PinoLoggerService);

  app.useLogger(app.get(NestPinoLogger));
  logger.infoContext('Bootstrap', 'Starting integrated ATLAS HTTP API process', {
    port: env.PORT,
    globalPrefix: env.API_GLOBAL_PREFIX,
    nodeEnv: env.NODE_ENV,
    modules: ['auth-gateway', 'b2b-sales-crm', 'accounting', 'ads'],
  });

  app.setGlobalPrefix(env.API_GLOBAL_PREFIX);
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.use(json({ limit: env.BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: env.BODY_LIMIT }));
  app.enableCors(buildCorsOptions());
  app.enableShutdownHooks();
  // Vacía el lote de spans pendiente al apagar. `stopTracing` nunca lanza: perder trazas no
  // puede convertir un apagado limpio en una caída.
  process.once('SIGTERM', () => void stopTracing());
  process.once('SIGINT', () => void stopTracing());

  app.useGlobalFilters(app.get(HttpExceptionFilter));
  // `TraceResponseInterceptor` va el PRIMERO —y por tanto el más externo— para fijar
  // `x-trace-id` mientras las cabeceras siguen siendo escribibles: más adentro, una descarga de
  // documento ya habría enviado la respuesta y escribir sobre ella lanzaría.
  app.useGlobalInterceptors(
    app.get(TraceResponseInterceptor),
    app.get(LoggingInterceptor),
    app.get(ResponseInterceptor),
  );

  await app.listen(env.PORT);

  logger.infoContext('Bootstrap', 'Integrated ATLAS HTTP API process is listening', {
    port: env.PORT,
    globalPrefix: env.API_GLOBAL_PREFIX,
  });
}

// Sequelize reemplaza `stack` por el de un `Error` vacío creado para capturar la traza,
// así que el motivo real sólo aparece en `message` y en la causa original del driver.
function describeFatalError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const parts = [`${error.name}: ${error.message}`, error.stack ?? ''];
  const cause: unknown = (error as { parent?: unknown; cause?: unknown }).parent ?? error.cause;
  if (cause instanceof Error) {
    const { code, detail, hint } = cause as { code?: string; detail?: string; hint?: string };
    parts.push(
      `Causa: ${cause.message}`,
      ...[
        code ? `  code: ${code}` : '',
        detail ? `  detail: ${detail}` : '',
        hint ? `  hint: ${hint}` : '',
      ].filter(Boolean),
    );
  }
  return parts.filter(Boolean).join('\n');
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `Fallo fatal al iniciar API integrada ATLAS: ${describeFatalError(error)}\n`,
  );
  process.exitCode = 1;
});
