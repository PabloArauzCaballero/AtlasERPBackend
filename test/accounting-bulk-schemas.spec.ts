import { bulkCreateAccountingDocumentsSchema } from '../src/modules/accounting/shared/schemas/accounting.schemas';

const uuid = '00000000-0000-4000-8000-000000000001';

const balancedDocument = {
  legalEntityId: uuid,
  sourceSystem: 'TEST',
  sourceType: 'SMOKE',
  sourceId: 'SRC-1',
  documentType: 'MANUAL',
  documentNo: 'DOC-1',
  documentDate: '2026-07-01T00:00:00.000Z',
  postingDate: '2026-07-01T00:00:00.000Z',
  accountingPeriodId: uuid,
  ledgerId: uuid,
  currencyCode: 'BOB',
  lines: [
    { glAccountId: uuid, debit: 100, credit: 0, currencyCode: 'BOB', amountLc: 100 },
    { glAccountId: uuid, debit: 0, credit: 100, currencyCode: 'BOB', amountLc: 100 },
  ],
};

describe('Accounting bulk schemas', () => {
  it('acepta lote válido de documentos contables', () => {
    const result = bulkCreateAccountingDocumentsSchema.safeParse({
      batchExternalId: 'BATCH-ACC-1',
      items: [balancedDocument],
    });

    expect(result.success).toBe(true);
  });

  it('rechaza documentos duplicados dentro del mismo lote', () => {
    const result = bulkCreateAccountingDocumentsSchema.safeParse({
      items: [balancedDocument, { ...balancedDocument, sourceId: 'SRC-2' }],
    });

    expect(result.success).toBe(false);
  });
});
