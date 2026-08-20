/**
 * Compone el manifiesto que este bloque publica sobre sí mismo.
 *
 * No guarda nada: junta las dos introspecciones vivas —router y `information_schema`— y las firma
 * con la identidad del bloque. Sin caché a propósito: se pide desde el federador de Atlas Backend
 * cada varios minutos, nunca en un camino caliente, y una caché sólo serviría para enseñar una
 * foto vieja justo después de un despliegue, que es cuando más importa que sea nueva.
 */
import { Injectable } from '@nestjs/common';
import { env } from '../../config/env';
import { RouteInventoryService } from './route-inventory.service';
import { SchemaInventoryService } from './schema-inventory.service';
import type { CatalogManifest } from './platform-catalog.types';

@Injectable()
export class PlatformCatalogService {
  constructor(
    private readonly routes: RouteInventoryService,
    private readonly schema: SchemaInventoryService,
  ) {}

  async manifest(): Promise<CatalogManifest> {
    const dataEntities = await this.schema.collect();
    const routePrefix = `/${env.API_GLOBAL_PREFIX.replace(/^\/+|\/+$/g, '')}`;

    return {
      block: {
        code: 'ERP_BACKEND',
        name: 'ATLAS ERP Backend',
        repository: 'AtlasERPBackend',
        service: 'atlas-erp-backend',
        version: process.env.APP_VERSION ?? 'unknown',
        commit: process.env.APP_COMMIT_SHA ?? 'unknown',
        routePrefix,
        generatedAt: new Date().toISOString(),
      },
      endpoints: this.routes.collect(routePrefix, 'ERP'),
      dataEntities,
    };
  }
}
