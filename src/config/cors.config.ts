import { Logger } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { env } from './env';

const logger = new Logger('Cors');

/*
 * Un origen se compara EXACTO (esquema + host + puerto), así que `https://x.com` y `https://x.com/`
 * son distintos para el navegador. La barra final sólo puede llegar de la lista escrita a mano en
 * Coolify, y si llega, ese origen no casa NUNCA y el fallo se ve como un CORS que «no se arregla
 * aunque el dominio esté puesto». Se normaliza al arrancar para que eso no dependa de cómo se tecleó.
 */
function normalizar(origen: string): string {
  return origen.trim().replace(/\/+$/, '');
}

/** Un aviso por origen desconocido, no uno por petición: si no, un bot llena el log. */
const yaAvisados = new Set<string>();

export function buildCorsOptions(): CorsOptions {
  const permitidos = new Set(env.CORS_ALLOWED_ORIGINS.map(normalizar).filter(Boolean));

  return {
    origin(origin, callback) {
      if (!origin || permitidos.has(normalizar(origin))) {
        callback(null, true);
        return;
      }

      /*
       * DENEGAR NO ES FALLAR. Antes esto era `callback(new Error(...))`, y un Error en este
       * callback no «bloquea el CORS»: revienta la petición ENTERA con 500
       * «CORS origin not allowed», venga de donde venga, porque el middleware lo pasa al
       * manejador de errores antes de que nadie mire la ruta.
       *
       * Medido el 2026-09-21 con los dominios propios de TEST recién publicados
       * (`https://atlas.erp.test.arauzsoftware.com`): el ERP se sirve por el rewrite de Next
       * (`/api/v1/:path*` -> `http://erp:3007`), que reenvía las cabeceras del navegador TAL CUAL,
       * incluida `Origin`. Como el dominio nuevo no estaba en la lista, el backend contestaba 500
       * a una llamada que era de servidor a servidor y de MISMO origen para el navegador:
       *   POST /api/v1/auth/login por el dominio nuevo -> 500
       *   el mismo POST por el dominio viejo           -> 401 (correcto)
       * El GET sí funcionaba, porque el navegador no manda `Origin` en un GET del mismo origen:
       * la pantalla cargaba y sólo se rompía al guardar o al entrar. Los otros tres backends de
       * Atlas (AtlasBackend, Motor, Tableros) ya denegaban sin fallar y por eso no se veía en ellos.
       *
       * Lo correcto es contestar SIN la cabecera `Access-Control-Allow-Origin`: la petición sigue su
       * curso y es el navegador quien descarta la respuesta, que es justo lo que protege el CORS.
       * Un proxy de confianza que reenvía `Origin` deja de ser un corte de servicio.
       */
      const limpio = normalizar(origin);
      if (!yaAvisados.has(limpio)) {
        yaAvisados.add(limpio);
        logger.warn(
          `Origen no declarado en CORS_ALLOWED_ORIGINS: ${limpio}. Se responde sin cabeceras CORS ` +
            'y el navegador descartará la respuesta. Si es un portal nuestro, añádelo a la lista.',
        );
      }
      callback(null, false);
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
      // El envío de campañas la exige (`admin-ads.controller.ts`) y el portal la manda.
      'X-Idempotency-Key',
    ],
  };
}
