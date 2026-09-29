import {
  billingTimingDomain,
  contractBillingCycleDomain,
  contractSettlementPolicyDomain,
  termTypeDomain,
} from '../src/modules/catalog/domains/crm.domains';

/**
 * Ayudas del catálogo que el frontend enseña junto a cada valor (adenda 2026-09-29, punto 6). Sólo
 * el MDR genera cobros (b2b-bnpl-billing) y el cierre de facturación es mensual y agrupa por cuenta
 * y moneda (merchant-billing-cycle): lo demás es una condición pactada que se guarda. Una ayuda que
 * dice «se cobra» de algo que nadie cobra es una promesa falsa en pantalla.
 */
type Domain = { description: string; options: ReadonlyArray<{ code: string; help: string }> };

function helpOf(domain: Domain, value: string): string {
  const option = domain.options.find((o) => o.code === value);
  if (!option) throw new Error(`${value} no existe en el dominio`);
  return option.help;
}

describe('Catálogo · condiciones comerciales que hoy sólo se guardan', () => {
  it.each(['SUBSCRIPTION', 'SETUP_FEE', 'SERVICE_FEE', 'PENALTY', 'MINIMUM_MONTHLY_FEE'])(
    'termType %s dice que se guarda y no promete cobro',
    (value) => expect(helpOf(termTypeDomain as unknown as Domain, value)).toMatch(/Se guarda/),
  );

  it.each(['ONE_TIME', 'ON_DEMAND'])('billingTiming %s dice que se guarda', (value) =>
    expect(helpOf(billingTimingDomain as unknown as Domain, value)).toMatch(/Se guarda/),
  );

  it.each(['QUARTERLY', 'SEMIANNUAL', 'ANNUAL'])(
    'billingCycle %s dice que el cierre es mensual',
    (value) =>
      expect(helpOf(contractBillingCycleDomain as unknown as Domain, value)).toMatch(/mensual/),
  );

  it.each(['PER_CONTRACT', 'PER_BRANCH'])(
    'settlementPolicy %s dice cómo agrupa hoy el cierre',
    (value) =>
      expect(helpOf(contractSettlementPolicyDomain as unknown as Domain, value)).toMatch(
        /por cuenta y moneda/,
      ),
  );

  it('las descripciones de los cuatro dominios dicen que es una condición pactada', () => {
    for (const domain of [
      termTypeDomain,
      billingTimingDomain,
      contractBillingCycleDomain,
      contractSettlementPolicyDomain,
    ] as unknown as Domain[]) {
      expect(domain.description).toMatch(/pact/);
    }
  });
});
