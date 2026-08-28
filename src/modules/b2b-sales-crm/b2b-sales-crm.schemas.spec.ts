import {
  bulkCreateAccountsSchema,
  createContractFromProposalSchema,
  createProposalSchema,
  issueInvoiceSchema,
  qualifyAccountSchema,
  registerMerchantPaymentSchema,
  registerPurchaseSchema,
} from './b2b-sales-crm.schemas';

const uuid = '00000000-0000-0000-0000-000000000001';

describe('B2B Sales CRM schemas', () => {
  it('acepta batch de cuentas y rechaza taxId duplicado dentro del mismo lote', () => {
    // `category` y `businessLine` son obligatorios desde la migración de perfil comercial robusto
    // (20260712120000), que las declaró NOT NULL en `atlas_sales.b2b_accounts`.
    const baseAccount = {
      legalName: 'Empresa Uno SRL',
      tradeName: 'Empresa Uno',
      taxId: '123456',
      category: 'RETAIL',
      businessLine: 'Tienda de electrodomésticos',
      primaryContact: { fullName: 'Contacto Uno', email: 'uno@example.com' },
    };

    const accepted = bulkCreateAccountsSchema.safeParse({
      batchExternalId: 'BATCH-B2B-1',
      items: [baseAccount],
    });

    const rejected = bulkCreateAccountsSchema.safeParse({
      items: [baseAccount, { ...baseAccount, tradeName: 'Empresa Dos' }],
    });

    expect(accepted.success).toBe(true);
    expect(rejected.success).toBe(false);
  });

  it('rechaza propuesta sin líneas', () => {
    const result = createProposalSchema.safeParse({
      opportunityId: uuid,
      proposalNumber: 'PROP-1',
      lines: [],
    });

    expect(result.success).toBe(false);
  });

  it('acepta compra con pago inicial y cuotas válidas', () => {
    const result = registerPurchaseSchema.safeParse({
      merchantAccountId: uuid,
      branchId: uuid,
      consumerId: uuid,
      purchaseAmount: 1000,
      downPaymentAmount: 600,
      financedAmount: 400,
      mdrReceivableDueDate: '2026-09-01',
      installments: [{ installmentNumber: 1, dueDate: '2026-09-01', amount: 400 }],
    });

    expect(result.success).toBe(true);
  });

  it('rechaza compra cuando cuotas no suman el monto financiado', () => {
    const result = registerPurchaseSchema.safeParse({
      merchantAccountId: uuid,
      branchId: uuid,
      consumerId: uuid,
      purchaseAmount: 1000,
      downPaymentAmount: 600,
      financedAmount: 400,
      mdrReceivableDueDate: '2026-09-01',
      installments: [{ installmentNumber: 1, dueDate: '2026-09-01', amount: 399 }],
    });

    expect(result.success).toBe(false);
  });

  it('rechaza compra con números de cuota duplicados', () => {
    const result = registerPurchaseSchema.safeParse({
      merchantAccountId: uuid,
      branchId: uuid,
      consumerId: uuid,
      purchaseAmount: 1000,
      downPaymentAmount: 600,
      financedAmount: 400,
      mdrReceivableDueDate: '2026-09-01',
      installments: [
        { installmentNumber: 1, dueDate: '2026-09-01', amount: 200 },
        { installmentNumber: 1, dueDate: '2026-10-01', amount: 200 },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rechaza fechas imposibles aunque respeten el formato YYYY-MM-DD', () => {
    const result = registerPurchaseSchema.safeParse({
      merchantAccountId: uuid,
      branchId: uuid,
      consumerId: uuid,
      purchaseAmount: 1000,
      downPaymentAmount: 600,
      financedAmount: 400,
      mdrReceivableDueDate: '2026-02-30',
      installments: [{ installmentNumber: 1, dueDate: '2026-09-01', amount: 400 }],
    });

    expect(result.success).toBe(false);
  });

  it('normaliza moneda ISO a mayúsculas en pagos comerciales', () => {
    const result = registerMerchantPaymentSchema.safeParse({
      accountId: uuid,
      amount: 100,
      currency: 'bob',
      paidAt: '2026-09-01T12:00:00.000Z',
      allocations: [{ receivableId: uuid, amountApplied: 100 }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('BOB');
    }
  });

  it('rechaza descalificación comercial sin motivo', () => {
    const result = qualifyAccountSchema.safeParse({
      hasCommercialFit: false,
      createOpportunity: false,
    });

    expect(result.success).toBe(false);
  });

  it('rechaza contrato con endDate anterior a startDate', () => {
    const result = createContractFromProposalSchema.safeParse({
      proposalId: uuid,
      contractNumber: 'CON-1',
      startDate: '2026-09-01',
      endDate: '2026-08-31',
    });

    expect(result.success).toBe(false);
  });

  it('rechaza factura con CxC duplicadas o vencimiento anterior a emisión', () => {
    const result = issueInvoiceSchema.safeParse({
      accountId: uuid,
      invoiceDate: '2026-09-10',
      dueDate: '2026-09-01',
      receivableIds: [uuid, uuid],
    });

    expect(result.success).toBe(false);
  });

  it('rechaza pago cuando las asignaciones no cuadran con el monto total', () => {
    const result = registerMerchantPaymentSchema.safeParse({
      accountId: uuid,
      amount: 100,
      paidAt: '2026-09-01T12:00:00.000Z',
      allocations: [{ receivableId: uuid, amountApplied: 90 }],
    });

    expect(result.success).toBe(false);
  });
});
