/**
 * Publica el manifiesto de catálogo del ERP para el panel de sistemas de ATLAS.
 *
 * Va marcado `@Public()` para saltarse el guard de JWT de usuario —quien llama es un servicio,
 * no una persona con sesión— y protegido en su lugar por `PlatformCatalogKeyGuard`, una
 * credencial que sólo abre esta lectura. Es de SOLO LECTURA y es un espejo: Atlas Backend federa
 * lo que aquí se publica y guarda su copia gobernada, con dueño y revisión humana, en su propio
 * catálogo. Aceptar escrituras aquí crearía dos sitios donde corregir la misma tabla.
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformCatalogKeyGuard } from './platform-catalog-key.guard';
import { HttpAccessRegistryService } from '../../common/observability/http-access-registry.service';
import { PlatformCatalogService } from './platform-catalog.service';
import type { CatalogManifest } from './platform-catalog.types';

@Controller('platform')
export class PlatformCatalogController {
  constructor(
    private readonly catalog: PlatformCatalogService,
    private readonly accesos: HttpAccessRegistryService,
  ) {}

  /**
   * Qué rutas de este bloque se han ejercitado de verdad y cómo acabaron. Lo consume Flujos para
   * verificar los flujos del ERP contra ejecución real en lugar de dar por bueno el código.
   *
   * Misma puerta que el manifiesto: quien llama es un servicio, no una persona. El alcance viaja
   * en la respuesta (`scope: 'process'`, `since`) porque el contador es de esta instancia y desde
   * su arranque: quien lo lea debe saber que un vacío significa «nadie ha pasado por aquí desde
   * que arrancó», no «esta ruta está rota».
   */
  @Public()
  @UseGuards(PlatformCatalogKeyGuard)
  @Get('access-runs')
  accessRuns() {
    return this.accesos.snapshot();
  }

  @Public()
  @UseGuards(PlatformCatalogKeyGuard)
  @Get('catalog-manifest')
  manifest(): Promise<CatalogManifest> {
    return this.catalog.manifest();
  }
}
