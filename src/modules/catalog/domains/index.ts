import type { DomainDefinition } from '../../../common/catalog/domain';
import { ACCOUNTING_DOMAINS } from './accounting.domains';
import { ADS_DOMAINS } from './ads.domains';
import { CRM_DOMAINS } from './crm.domains';
import { PLATFORM_DOMAINS } from './platform.domains';

/** Todos los dominios cerrados del ERP, por nombre. */
export const ALL_DOMAINS: readonly DomainDefinition[] = [
  ...ACCOUNTING_DOMAINS,
  ...CRM_DOMAINS,
  ...ADS_DOMAINS,
  ...PLATFORM_DOMAINS,
];

function indexByName(domains: readonly DomainDefinition[]): ReadonlyMap<string, DomainDefinition> {
  const byName = new Map<string, DomainDefinition>();
  for (const domain of domains) {
    if (byName.has(domain.name)) {
      throw new Error(`Dominio declarado dos veces: «${domain.name}».`);
    }
    byName.set(domain.name, domain);
  }
  return byName;
}

export const DOMAINS_BY_NAME = indexByName(ALL_DOMAINS);
