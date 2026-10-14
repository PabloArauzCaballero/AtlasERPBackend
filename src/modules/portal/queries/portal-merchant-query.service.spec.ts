import { Op } from 'sequelize';
import {
  ADVERTISER_ID,
  activeAdvertiser,
  buildHarness,
  campaignDouble,
  merchantScope,
} from '../portal.harness';

describe('PortalMerchantQueryService', () => {
  describe('listAdvertisers', () => {
    it('devuelve vacío sin consultar cuando el comercio no tiene anunciantes', async () => {
      const harness = buildHarness();
      harness.scopeService.resolveAccessibleAdvertiserIds.mockResolvedValue([]);

      const result = await harness.merchant.listAdvertisers(merchantScope, {
        page: 1,
        limit: 50,
      });

      expect(result).toEqual([]);
      expect(harness.advertiserModel.findAll).not.toHaveBeenCalled();
    });

    it('no publica el NIT ni el límite de crédito del anunciante', async () => {
      const harness = buildHarness();
      harness.advertiserModel.findAll.mockResolvedValue([
        activeAdvertiser({ taxId: '1234567', creditLimitMicros: '900000000' }),
      ]);

      const [advertiser] = await harness.merchant.listAdvertisers(merchantScope, {
        page: 1,
        limit: 50,
      });

      expect(advertiser).not.toHaveProperty('taxId');
      expect(advertiser).not.toHaveProperty('creditLimitMicros');
      expect(advertiser?.tradeName).toBe('Comercio');
    });
  });

  describe('listCampaigns', () => {
    it('exige propiedad del anunciante antes de consultar', async () => {
      const harness = buildHarness();
      harness.scopeService.assertAdvertiserAccess.mockRejectedValue(new Error('forbidden'));

      await expect(
        harness.merchant.listCampaigns(merchantScope, {
          advertiserId: ADVERTISER_ID,
          page: 1,
          limit: 50,
        }),
      ).rejects.toThrow('forbidden');

      expect(harness.campaignModel.findAll).not.toHaveBeenCalled();
    });

    it('marca qué campañas puede alternar el comercio', async () => {
      const harness = buildHarness();
      harness.campaignModel.findAll.mockResolvedValue([
        campaignDouble({ id: 'c1', status: 'ACTIVE' }),
        campaignDouble({ id: 'c2', status: 'ENDED' }),
      ]);

      const campaigns = await harness.merchant.listCampaigns(merchantScope, {
        advertiserId: ADVERTISER_ID,
        page: 1,
        limit: 50,
      });

      expect(campaigns.map((campaign) => campaign.toggleable)).toEqual([true, false]);
    });
  });
});

/*
 * Quién tiene que ELEGIR comercio lo contesta el servidor.
 *
 * Es la pieza que faltaba y por la que cuatro pantallas del portal se quedaban sin salida: el
 * navegador deducía por su cuenta si era comercio, y cuando se equivocaba no pintaba el selector
 * mientras el backend exigía la cuenta que ese selector habría dado.
 */
describe('getScope', () => {
  const cuentas = [
    { id: 'a1000000-0000-4000-8000-000000000001', tradeName: 'Alfa Store', legalName: 'Alfa SRL' },
    { id: 'a1000000-0000-4000-8000-000000000002', tradeName: '', legalName: 'Beta SA' },
  ];

  it('el staff interno SIEMPRE elige, y ve el catálogo', async () => {
    const harness = buildHarness();
    harness.accountModel.findAll.mockResolvedValue(cuentas);

    const result = await harness.merchant.getScope({
      isInternalOperator: true,
      accountIds: [],
      userId: 'u1',
      email: null,
      roles: ['ADMIN'],
    } as never);

    expect(result.isInternalOperator).toBe(true);
    expect(result.requiresAccountSelection).toBe(true);
    // Sin filtro por cuenta: el staff las ve todas.
    expect(harness.accountModel.findAll.mock.calls[0]?.[0]?.where).toEqual({});
    // El nombre cae al razón social cuando no hay nombre comercial, en vez de salir vacío.
    expect(result.accounts).toEqual([
      { id: cuentas[0]!.id, name: 'Alfa Store' },
      { id: cuentas[1]!.id, name: 'Beta SA' },
    ]);
  });

  it('un comercio con UNA cuenta no elige: la deriva el backend', async () => {
    const harness = buildHarness();
    harness.accountModel.findAll.mockResolvedValue([cuentas[0]]);

    const result = await harness.merchant.getScope({
      isInternalOperator: false,
      accountIds: [cuentas[0]!.id],
      userId: 'u2',
      email: 'due@comercio.test',
      roles: ['MERCHANT_ADMIN'],
    } as never);

    expect(result.isInternalOperator).toBe(false);
    expect(result.requiresAccountSelection).toBe(false);
    expect(result.accounts).toHaveLength(1);
  });

  it('un comercio con VARIAS cuentas sí elige, y sólo entre las suyas', async () => {
    const harness = buildHarness();
    harness.accountModel.findAll.mockResolvedValue(cuentas);
    const mias = [cuentas[0]!.id, cuentas[1]!.id];

    const result = await harness.merchant.getScope({
      isInternalOperator: false,
      accountIds: mias,
      userId: 'u3',
      email: 'multi@comercio.test',
      roles: ['MERCHANT_ADMIN'],
    } as never);

    expect(result.requiresAccountSelection).toBe(true);
    /*
     * El filtro es lo que impide que este endpoint sea una lista de comercios ajenos: un comercio
     * ve las suyas y nada más, que es lo que lo hace seguro de llamar desde el portal.
     */
    expect(harness.accountModel.findAll.mock.calls[0]?.[0]?.where).toEqual({
      id: { [Op.in]: mias },
    });
  });
});
