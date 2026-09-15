import { BadRequestException, Injectable } from '@nestjs/common';
import type { DomainDefinition, DomainOption } from '../../common/catalog/domain';
import { ALL_DOMAINS, DOMAINS_BY_NAME } from './domains';

export interface PublishedDomain {
  name: string;
  description: string;
  options: DomainOption[];
}

function publish(domain: DomainDefinition): PublishedDomain {
  return {
    name: domain.name,
    description: domain.description,
    options: domain.options.map((option) => ({
      code: option.code,
      label: option.label,
      help: option.help,
    })),
  };
}

@Injectable()
export class CatalogService {
  /**
   * Todos los dominios (o los pedidos), como mapa `nombre → opciones`.
   *
   * Un nombre desconocido es un 400 y no se ignora: un frontend que pide un dominio que no existe
   * pintaría un select vacío, y un select vacío en un campo obligatorio vuelve a ser el formulario
   * que no se puede enviar que esto vino a arreglar.
   */
  list(names?: string[]): { domains: Record<string, DomainOption[]> } {
    const selected = names?.length
      ? names.map((name) => {
          const domain = DOMAINS_BY_NAME.get(name);
          if (!domain) {
            throw new BadRequestException({
              code: 'CATALOG_DOMAIN_NOT_FOUND',
              message: `No existe el dominio «${name}».`,
              details: [{ path: ['names'], message: name }],
            });
          }
          return domain;
        })
      : ALL_DOMAINS;

    return {
      domains: Object.fromEntries(selected.map((domain) => [domain.name, publish(domain).options])),
    };
  }

  one(name: string): PublishedDomain | undefined {
    const domain = DOMAINS_BY_NAME.get(name);
    return domain ? publish(domain) : undefined;
  }
}
