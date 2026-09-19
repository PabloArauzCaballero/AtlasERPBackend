import { Global, Module } from '@nestjs/common';
import { HttpAccessRegistryService } from './http-access-registry.service';
import { MessagingTraceService } from './messaging-trace.service';
import { TraceContextService } from './trace-context.service';
import { TracingService } from './tracing.service';

/**
 * El registro de accesos, disponible en todo el árbol y con UNA sola instancia.
 *
 * ## Por qué global y no un proveedor más de `AppModule`
 *
 * Lo escribe el interceptor global y lo lee el controlador de `PlatformCatalogModule`, que es otro
 * módulo. Un proveedor declarado en `AppModule` no es visible desde un módulo hijo: Nest no arranca
 * y el error («no puede resolver HttpAccessRegistryService») sólo aparece al levantar la aplicación
 * entera, nunca en una prueba unitaria. Declararlo también en el módulo hijo compilaría y sería
 * peor: dos instancias, el interceptor contando en una y el endpoint leyendo la otra siempre vacía.
 */
/**
 * La capa de TRAZADO vive aquí por la misma razón que el registro de accesos: es `@Global` para
 * que un módulo de dominio pueda instrumentarse sin importar nada, porque el que no lo importa
 * es justamente el que se queda sin observabilidad.
 *
 * El ARRANQUE del SDK vive fuera del contenedor, en `src/observability/tracing.ts`, porque debe
 * ocurrir antes de que se cargue cualquier módulo instrumentable. Aquí sólo están las piezas que
 * el dominio inyecta.
 *
 * El interceptor que publica `x-trace-id` se registra en `main.ts`, no aquí: su ORDEN respecto
 * de los demás importa y sólo es determinista en un único sitio.
 */
@Global()
@Module({
  providers: [
    HttpAccessRegistryService,
    TracingService,
    TraceContextService,
    MessagingTraceService,
  ],
  exports: [HttpAccessRegistryService, TracingService, TraceContextService, MessagingTraceService],
})
export class ObservabilityModule {}
