import { Test } from '@nestjs/testing';
import { ObservabilityModule } from '../src/common/observability/observability.module';
import { HttpAccessRegistryService } from '../src/common/observability/http-access-registry.service';
import { PlatformCatalogModule } from '../src/modules/platform-catalog/platform-catalog.module';
import { PlatformCatalogController } from '../src/modules/platform-catalog/platform-catalog.controller';
import { SchemaInventoryService } from '../src/modules/platform-catalog/schema-inventory.service';
import { AppModule } from '../src/app.module';

/**
 * El registro de accesos lo ESCRIBE el interceptor global y lo LEE un controlador que vive en otro
 * módulo. Declararlo como proveedor suelto de `AppModule` compila, pasa las 327 pruebas unitarias
 * —ninguna levanta el árbol— y revienta al arrancar el proceso: `Nest can't resolve dependencies of
 * the PlatformCatalogController`. En un despliegue eso es un contenedor en bucle de reinicio con el
 * build en verde.
 *
 * Esta prueba compila el módulo de verdad y comprueba las dos cosas que hacen falta: que el
 * controlador se resuelve, y que la instancia es LA MISMA que ve el resto del árbol. Si algún día
 * alguien «arregla» un fallo de resolución declarando el servicio también en el módulo hijo, la
 * aplicación arrancaría y el endpoint devolvería siempre vacío: dos contadores, uno por módulo.
 */
describe('PlatformCatalogModule · resolución del registro de accesos', () => {
  it('el controlador se resuelve y comparte la instancia global del registro', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ObservabilityModule, PlatformCatalogModule],
    })
      // Lo único que se sustituye es lo que necesita una conexión a base: el inventario de esquema.
      // El resto del módulo —el controlador, sus guardas y el registro de accesos— es el de verdad.
      .overrideProvider(SchemaInventoryService)
      .useValue({ entities: () => [] })
      .compile();

    const controller = moduleRef.get(PlatformCatalogController);
    expect(controller).toBeInstanceOf(PlatformCatalogController);

    const registro = moduleRef.get(HttpAccessRegistryService);
    registro.record('GET', '/api/v1/platform/access-runs', 200);
    expect(controller.accessRuns().entries).toHaveLength(1);

    await moduleRef.close();
  });

  it('el árbol de la aplicación importa el módulo global: sin eso el proceso no arranca', () => {
    // La prueba de arriba compila un subárbol; ésta fija el cableado real. Volver a declarar el
    // registro como proveedor suelto de `AppModule` dejaría aquella en verde y el proceso muerto.
    const importados = (Reflect.getMetadata('imports', AppModule) ?? []) as unknown[];
    expect(importados).toContain(ObservabilityModule);
  });
});
