import { Global, Module } from '@nestjs/common';
import { HttpAccessRegistryService } from './http-access-registry.service';

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
@Global()
@Module({
  providers: [HttpAccessRegistryService],
  exports: [HttpAccessRegistryService],
})
export class ObservabilityModule {}
