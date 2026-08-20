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
import { PlatformCatalogService } from './platform-catalog.service';
import type { CatalogManifest } from './platform-catalog.types';

@Controller('platform')
export class PlatformCatalogController {
  constructor(private readonly catalog: PlatformCatalogService) {}

  @Public()
  @UseGuards(PlatformCatalogKeyGuard)
  @Get('catalog-manifest')
  manifest(): Promise<CatalogManifest> {
    return this.catalog.manifest();
  }
}
