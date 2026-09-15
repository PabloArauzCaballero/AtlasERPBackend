import { Controller, Get, Header, NotFoundException, Param, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  catalogDomainParamsSchema,
  catalogDomainsQuerySchema,
  splitDomainNames,
  type CatalogDomainParamsDto,
  type CatalogDomainsQueryDto,
} from './catalog.schemas';
import { CatalogService } from './catalog.service';

/**
 * Los valores válidos de cada campo cerrado del ERP, con su etiqueta.
 *
 * Sin `@Roles`: cualquier usuario autenticado —interno o del comercio— necesita saber qué puede
 * elegir en un formulario, y nada de esto es un dato de negocio. La autenticación sigue siendo
 * obligatoria por el guard global.
 */
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('domains')
  @Header('Cache-Control', 'private, max-age=300')
  list(@Query(new ZodValidationPipe(catalogDomainsQuerySchema)) query: CatalogDomainsQueryDto) {
    return this.catalog.list(splitDomainNames(query.names));
  }

  @Get('domains/:name')
  @Header('Cache-Control', 'private, max-age=300')
  one(@Param(new ZodValidationPipe(catalogDomainParamsSchema)) params: CatalogDomainParamsDto) {
    const domain = this.catalog.one(params.name);
    if (!domain) {
      throw new NotFoundException({
        code: 'CATALOG_DOMAIN_NOT_FOUND',
        message: `No existe el dominio «${params.name}».`,
      });
    }
    return domain;
  }
}
