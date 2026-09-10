import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { env } from './env';

export function buildCorsOptions(): CorsOptions {
  return {
    origin(origin, callback) {
      if (!origin || env.CORS_ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Cada cabecera propia que manda el portal tiene que estar aquí, o el preflight la rechaza y con
    // ella TODA la petición. Hoy el portal llama por su proxy (mismo origen, sin preflight), pero con
    // una base absoluta —la que traía `.env.example`— `x-correlation-id` ya rompía cada llamada.
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'X-Request-Id',
      'X-Correlation-Id',
      'X-Atlas-Flow',
      'X-Atlas-Product',
    ],
  };
}
