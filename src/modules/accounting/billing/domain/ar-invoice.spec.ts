import {
  assertContractBillable,
  assertFiscalStatusNotClientAsserted,
  assertTaxFieldsConsistent,
  buildInvoiceJournalLines,
  invoiceDeletionBlockers,
  pickEditableInvoiceFields,
  type ResolvedArInvoice,
} from './ar-invoice';

const invoice = {
  legalEntityId: 'le',
  customerBpId: 'bp',
  arAccountId: 'ar',
  revenueAccountId: 'rev',
  taxLiabilityAccountId: 'tax',
  taxCodeId: 'iva',
  currencyCode: 'BOB',
  netAmount: 100,
  taxAmount: 13,
  description: 'Servicio',
} as unknown as ResolvedArInvoice;

describe('buildInvoiceJournalLines', () => {
  it('CxC por el bruto, ingreso por el neto e IVA débito', () => {
    const lines = buildInvoiceJournalLines(invoice, 113, 'inv-1', 'FAC-1');
    expect(lines.map((l) => [l.glAccountId, l.debit, l.credit])).toEqual([
      ['ar', 113, 0],
      ['rev', 0, 100],
      ['tax', 0, 13],
    ]);
  });

  it('sin impuesto no hay línea de IVA', () => {
    const lines = buildInvoiceJournalLines({ ...invoice, taxAmount: 0 }, 100, 'inv-1', 'FAC-1');
    expect(lines).toHaveLength(2);
  });
});

describe('guardas de la factura', () => {
  it('rechaza el estado fiscal afirmado por el cliente', () => {
    expect(() =>
      assertFiscalStatusNotClientAsserted({ electronicTaxDocument: {} } as never),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'FISCAL_STATUS_NOT_CLIENT_ASSERTED' }),
      }),
    );
    expect(() => assertFiscalStatusNotClientAsserted({} as never)).not.toThrow();
  });

  it('el contrato debe ser de la entidad y del cliente, y estar activo o aprobado', () => {
    const contract = { legalEntityId: 'le', counterpartyBpId: 'bp', status: 'ACTIVE' };
    expect(() => assertContractBillable(contract, invoice)).not.toThrow();
    expect(() => assertContractBillable({ ...contract, counterpartyBpId: 'x' }, invoice)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'INVOICE_CONTRACT_MISMATCH' }),
      }),
    );
    expect(() => assertContractBillable({ ...contract, status: 'DRAFT' }, invoice)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'CONTRACT_NOT_ACTIVE' }),
      }),
    );
  });

  it('impuesto exige cuenta y código; sin impuesto no se informa cuenta fiscal', () => {
    expect(() => assertTaxFieldsConsistent(invoice)).not.toThrow();
    expect(() => assertTaxFieldsConsistent({ ...invoice, taxCodeId: undefined })).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'TAX_ACCOUNT_AND_CODE_REQUIRED' }),
      }),
    );
    expect(() => assertTaxFieldsConsistent({ ...invoice, taxAmount: 0 })).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'TAX_ACCOUNT_WITHOUT_TAX_AMOUNT' }),
      }),
    );
  });
});

describe('mantenimiento de la factura', () => {
  it('sólo se editan fecha, vencimiento y estado; nunca el correlativo', () => {
    expect(
      pickEditableInvoiceFields({ invoiceNo: 'X', dueDate: 'd', status: 's', netAmount: 1 }),
    ).toEqual({ dueDate: 'd', status: 's' });
  });

  it('lista todos los motivos que impiden borrar', () => {
    expect(
      invoiceDeletionBlockers(
        { status: 'PAID', accountingDocumentId: 'doc' },
        { receiptAllocations: 1, fiscalDocuments: 2 },
      ),
    ).toEqual([
      'STATUS_PAID',
      'HAS_ACCOUNTING_DOCUMENT',
      'HAS_RECEIPT_ALLOCATIONS',
      'HAS_FISCAL_DOCUMENT',
    ]);
    expect(
      invoiceDeletionBlockers(
        { status: 'DRAFT', accountingDocumentId: null },
        { receiptAllocations: 0, fiscalDocuments: 0 },
      ),
    ).toEqual([]);
  });
});
