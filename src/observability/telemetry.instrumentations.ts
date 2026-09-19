/**
 * @file Las cinco instrumentaciones automáticas de este backend, elegidas una a una.
 * @business Esta pieza reduce el tiempo de detección y recuperación de incidentes.
 * @system parchea http, express, pg y undici sin capturar cabeceras ni valores.
 */
import type { IncomingMessage } from 'node:http';
import type { RequestOptions } from 'node:https';
import type { Span } from '@opentelemetry/api';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation, ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { UndiciInstrumentation, type UndiciRequest } from '@opentelemetry/instrumentation-undici';
import { ATTR_DB_QUERY_TEXT } from '@opentelemetry/semantic-conventions';
import { redactSqlLiterals } from './sql-redaction';
import { UNTRACED_HTTP_PATH_SUFFIXES } from './telemetry.constants';
import type { TelemetryConfig } from './telemetry.types';

/**
 * No se usa `auto-instrumentations-node`: habilita más de cuarenta parches —`fs`, `dns`, `net`,
 * `winston`, `graphql`…— de los que este backend sólo necesita cuatro. El resto son spans por
 * cada lectura de fichero y cada resolución de nombre, que entierran la operación de negocio
 * bajo ruido y cuestan latencia en el camino caliente. Aquí se declara exactamente lo que hay:
 *
 * | Instrumentación | Qué cubre en este backend |
 * | --- | --- |
 * | `http` | Peticiones entrantes; salientes por `http`/`https` — **incluido axios**, que emite por ahí |
 * | `express` | Enrutado bajo NestJS |
 * | `pg` | Toda consulta de Sequelize y las del worker de outbox, que usa un `Client` crudo |
 * | `undici` | `fetch` global: correo, documentos y la pasarela de soporte |
 *
 * **No hay instrumentación de Redis**: el ERP no usa Redis. Instrumentar lo que no existe es
 * peso muerto en la imagen y una dependencia más que mantener.
 *
 * **No hay instrumentación de axios ni de Sequelize a propósito.** Axios en Node emite por el
 * módulo `http` y Sequelize por el driver `pg`, y los dos ya están instrumentados: añadirlas
 * duplicaría cada llamada y cada consulta en dos spans que describen lo mismo.
 *
 * Los parámetros de los hooks van anotados EXPLÍCITAMENTE y no por inferencia contextual. Si el
 * árbol acaba con dos copias de `@opentelemetry/instrumentation` —lo que ocurre en cuanto una
 * instrumentación pide un minor distinto, porque para una versión 0.x el cursor `^` no lo
 * cruza—, cada copia declara su propio `InstrumentationConfig` y TypeScript pierde el tipo
 * contextual con TS7006 sobre parámetros que nadie ha tocado. El síntoma es desconcertante:
 * compila en una máquina de desarrollo con `node_modules` incremental y FALLA en la instalación
 * limpia del contenedor. Las anotaciones hacen este archivo inmune a esa divergencia.
 */
export function buildInstrumentations(config: TelemetryConfig): Instrumentation[] {
  const exporterTarget = parseExporterTarget(config.tracesEndpoint);

  return [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (request: IncomingMessage) => isUntracedPath(request.url),
      // El exportador OTLP habla por el módulo `http`. Sin esta exclusión, exportar un lote de
      // spans genera un span, cuya exportación genera otro: un bucle que se retroalimenta y que
      // sólo se nota cuando el colector ya está saturado.
      ignoreOutgoingRequestHook: (request: RequestOptions) => isExporterRequest(request, exporterTarget),
      // Deliberadamente SIN `headersToSpanAttributes`: capturar cabeceras traería
      // `authorization`, `cookie` y `x-api-key` al sistema de trazas.
    }),
    new ExpressInstrumentation({
      /*
       * Sin spans por capa de middleware.
       *
       * Medido el 2026-09-18 sobre `POST /api/v1/auth/login`: de 18 spans, SIETE eran middleware
       * (`helmet`, `cors`, `compression`, dos parseadores y dos anónimos) y cinco de ellos
       * duraban 0,0 ms. Son coste fijo por petición y esconden los seis spans que sí explican
       * algo. La regla de esta fase es que una traza tiene que poder leerse, no que lo tenga todo.
       *
       * Lo único que se pierde es el coste del parseo del cuerpo (8,7 ms en esa medición), y no
       * se pierde del todo: sigue visible como el hueco entre el inicio del span del servidor y
       * el del manejador. Si alguna vez hace falta el detalle, se quita esta línea.
       */
      ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
    }),
    // `enhancedDatabaseReporting: false` deja fuera los valores de los parámetros LIGADOS, pero
    // NO basta: Sequelize incrusta literales en el texto de algunas consultas y ese texto es
    // `db.statement`. El hook lo reescribe sin contenido. Ver `sql-redaction.ts`.
    new PgInstrumentation({
      enhancedDatabaseReporting: false,
      // Sobrescribe el MISMO atributo que fija la instrumentación (`db.query.text` desde
      // `instrumentation-pg@0.74`; antes se llamaba `db.statement`). Si el nombre volviera a
      // cambiar al subir de versión, la prueba E2E de fuga lo caza: busca el dato, no la clave.
      requestHook: (span: Span, info: { query: { text?: string } }) => {
        const text = info.query.text;
        if (typeof text === 'string') span.setAttribute(ATTR_DB_QUERY_TEXT, redactSqlLiterals(text));
      },
    }),
    new UndiciInstrumentation({
      ignoreRequestHook: (request: UndiciRequest) => isUntracedPath(request.path),
    }),
  ];
}

/** Compara por SUFIJO: la API monta las sondas bajo `/api/v1` y el worker sin prefijo. */
function isUntracedPath(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0] ?? '';
  if (path === '') return false;
  return UNTRACED_HTTP_PATH_SUFFIXES.some((suffix) => path === suffix || path.endsWith(suffix));
}

type ExporterTarget = Readonly<{ host: string; port: string }>;

/** Destino del exportador, para poder reconocer —y no trazar— sus propias peticiones. */
function parseExporterTarget(endpoint: string | undefined): ExporterTarget | undefined {
  if (endpoint === undefined) return undefined;
  try {
    const url = new URL(endpoint);
    return { host: url.hostname, port: url.port };
  } catch {
    // Un endpoint ilegible ya lo señala el exportador al arrancar; aquí sólo significa que no se
    // puede excluir por destino, nunca un fallo de arranque.
    return undefined;
  }
}

/** `RequestOptions` de Node admite `null` en host y hostname, de ahí la firma ancha. */
function isExporterRequest(
  request: {
    host?: string | null | undefined;
    hostname?: string | null | undefined;
    port?: number | string | null | undefined;
  },
  target: ExporterTarget | undefined,
): boolean {
  if (target === undefined) return false;
  const host = request.hostname ?? request.host ?? '';
  const port = String(request.port ?? '');
  return host.split(':')[0] === target.host && (target.port === '' || port === target.port);
}
