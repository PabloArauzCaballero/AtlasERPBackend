import { ACCOUNT_ID, buildHarness, merchantScope } from '../portal.harness';

describe('PortalBillingQueryService', () => {
  describe('getBillingPanel', () => {
    it('toma los totales de la base y no de la página devuelta', async () => {
      const harness = buildHarness([
        {
          invoice_count: '1200',
          invoiced_total: '9876543.21',
          open_receivable_count: '15',
          open_total: '1234.50',
        },
      ]);

      const panel = await harness.billing.getBillingPanel(merchantScope, ACCOUNT_ID);

      expect(panel.summary).toMatchObject({
        invoiceCount: 1200,
        invoicedTotal: '9876543.21',
        openReceivableCount: 15,
        openTotal: '1234.50',
      });
      // Los documentos listados están acotados; los totales no dependen de ese tope.
      expect(panel.documentLimit).toBe(50);
      expect(harness.invoiceModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 }),
      );
    });

    it('resuelve la cuenta a través del servicio de alcance', async () => {
      const harness = buildHarness([]);
      await harness.billing.getBillingPanel(merchantScope, ACCOUNT_ID);
      expect(harness.scopeService.resolveAccountId).toHaveBeenCalledWith(merchantScope, ACCOUNT_ID);
    });
  });
});
