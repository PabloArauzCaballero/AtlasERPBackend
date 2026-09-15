import type { Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { nextDocumentNumber } from '../src/common/numbering/document-numbering';
import { fiscalYearLabel } from '../src/modules/accounting/financial-structure/fiscal-year-label';
import {
  bulkCreateAccountingDocumentsSchema,
  createAccountingDocumentSchema,
  createAccountingPeriodSchema,
  createBusinessPartnerSchema,
  createContractHeaderSchema,
  createFiscalYearSchema,
  recordReceiptSchema,
  reverseAccountingDocumentSchema,
} from '../src/modules/accounting/shared/schemas/accounting.schemas';
import {
  createContractFromProposalSchema,
  createProposalSchema,
} from '../src/modules/b2b-sales-crm/b2b-sales-crm.schemas';

/**
 * Los correlativos que se pedían al usuario pasan a asignarlos el backend (2026-09-15).
 *
 * El número no viaja en la petición (se descarta si llega): lo genera `nextDocumentNumber` con la
 * misma serie y el mismo cerrojo que ya numeran las facturas. `documentNo` sigue aceptándose porque
 * los importadores contables traen el suyo.
 */

const uuid = '11111111-1111-4111-8111-111111111111';

describe('el número deja de ser obligatorio', () => {
  it('propuesta y contrato comercial', () => {
    expect(
      createProposalSchema.safeParse({
        opportunityId: uuid,
        lines: [
          { termType: 'MDR', description: 'Comisión', ratePercent: 2.5, billingTiming: 'MONTHLY' },
        ],
      }).success,
    ).toBe(true);
    expect(
      createContractFromProposalSchema.safeParse({ proposalId: uuid, startDate: '2026-09-15' })
        .success,
    ).toBe(true);
  });

  it('recibo, business partner y contrato contable', () => {
    expect(
      recordReceiptSchema.safeParse({
        legalEntityId: uuid,
        payerBpId: uuid,
        receiptDate: '2026-09-15',
        amount: 10,
        currencyCode: 'BOB',
        bankGlAccountId: uuid,
        arControlGlAccountId: uuid,
        accountingPeriodId: uuid,
        ledgerId: uuid,
        allocations: [{ arInvoiceId: uuid, allocatedAmount: 10 }],
      }).success,
    ).toBe(true);
    expect(
      createBusinessPartnerSchema.safeParse({ partnerType: 'COMPANY', legalName: 'Empresa SRL' })
        .success,
    ).toBe(true);
    expect(
      createContractHeaderSchema.safeParse({
        contractType: 'SUPPLIER',
        legalEntityId: uuid,
        counterpartyBpId: uuid,
        startDate: '2026-09-15',
      }).success,
    ).toBe(true);
  });

  it('año fiscal y período se derivan', () => {
    expect(
      createFiscalYearSchema.safeParse({
        legalEntityId: uuid,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      }).success,
    ).toBe(true);
    expect(
      createAccountingPeriodSchema.safeParse({
        fiscalYearId: uuid,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      }).success,
    ).toBe(true);
  });

  /*
   * Tiempo 2 (mismo día): el número ya NO viaja. Si una pantalla vieja lo manda, se descarta —como
   * con las facturas— y el backend numera igual. Así no hay ventana de 400 mientras se despliega.
   */
  it('un número mandado a mano se descarta', () => {
    const parsed = createProposalSchema.parse({
      opportunityId: uuid,
      proposalNumber: 'CP-2026-001',
      lines: [
        {
          termType: 'SETUP_FEE',
          description: 'Alta',
          fixedAmount: 100,
          billingTiming: 'ONE_TIME',
        },
      ],
    });
    expect(parsed).not.toHaveProperty('proposalNumber');
    expect(
      recordReceiptSchema.parse({
        legalEntityId: uuid,
        payerBpId: uuid,
        receiptNo: 'DEMO-REC-0001',
        receiptDate: '2026-09-15',
        amount: 10,
        currencyCode: 'BOB',
        bankGlAccountId: uuid,
        arControlGlAccountId: uuid,
        accountingPeriodId: uuid,
        ledgerId: uuid,
        allocations: [{ arInvoiceId: uuid, allocatedAmount: 10 }],
      }),
    ).not.toHaveProperty('receiptNo');
  });
});

describe('documentos contables sin número', () => {
  const item = {
    legalEntityId: uuid,
    sourceSystem: 'ACCOUNTING',
    sourceType: 'MANUAL',
    documentType: 'JOURNAL',
    documentDate: '2026-09-15',
    postingDate: '2026-09-15',
    accountingPeriodId: uuid,
    ledgerId: uuid,
    currencyCode: 'BOB',
    lines: [
      { glAccountId: uuid, debit: 10, currencyCode: 'BOB' },
      { glAccountId: uuid, credit: 10, currencyCode: 'BOB' },
    ],
  };

  it('un documento y su reversión pueden llegar sin número', () => {
    expect(createAccountingDocumentSchema.safeParse({ ...item, sourceId: 'A' }).success).toBe(true);
    expect(
      reverseAccountingDocumentSchema.safeParse({
        reversalDate: '2026-09-16',
        accountingPeriodId: uuid,
        reason: 'Error de imputación',
      }).success,
    ).toBe(true);
  });

  it('dos documentos sin número en un lote no son «duplicados»', () => {
    const result = bulkCreateAccountingDocumentsSchema.safeParse({
      items: [
        { ...item, sourceId: 'A' },
        { ...item, sourceId: 'B' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('dos documentos con el MISMO número siguen siendo duplicados', () => {
    const result = bulkCreateAccountingDocumentsSchema.safeParse({
      items: [
        { ...item, sourceId: 'A', documentNo: 'X-1' },
        { ...item, sourceId: 'B', documentNo: 'x-1' },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('series nuevas con el generador existente', () => {
  const fakeSequelize = (ultimo: string | null) => {
    const calls: { sql: string; replacements: Record<string, unknown> }[] = [];
    const sequelize = {
      query: jest.fn(async (sql: string, options: { replacements: Record<string, unknown> }) => {
        calls.push({ sql, replacements: options.replacements });
        return sql.includes('MAX(') ? [{ ultimo }] : [];
      }),
    } as unknown as Sequelize;
    return { sequelize, calls };
  };
  const transaction = {} as Transaction;

  it('la primera propuesta del año es PROP-AAAA-000001', async () => {
    const { sequelize } = fakeSequelize(null);
    await expect(
      nextDocumentNumber(
        sequelize,
        {
          prefix: 'PROP',
          table: 'atlas_sales.commercial_proposals',
          column: 'proposal_number',
          date: '2026-09-15',
        },
        transaction,
      ),
    ).resolves.toBe('PROP-2026-000001');
  });

  it('el recibo sigue la serie de SU entidad legal y bloquea esa serie', async () => {
    const { sequelize, calls } = fakeSequelize('REC-2026-000041');
    await expect(
      nextDocumentNumber(
        sequelize,
        {
          prefix: 'REC',
          table: 'atlas_accounting.receipt',
          column: 'receipt_no',
          date: '2026-09-15',
          scope: { column: 'legal_entity_id', value: uuid },
        },
        transaction,
      ),
    ).resolves.toBe('REC-2026-000042');
    expect(calls[0]!.replacements.clave).toBe(
      `atlas_accounting.receipt.receipt_no:legal_entity_id:${uuid}:REC-2026-`,
    );
    expect(calls[1]!.sql).toContain('"legal_entity_id" = :scopeValue');
  });

  it('un número viejo tecleado a mano (CP-2026-001) no entra en la serie nueva', async () => {
    const { sequelize, calls } = fakeSequelize(null);
    await nextDocumentNumber(
      sequelize,
      {
        prefix: 'PROP',
        table: 'atlas_sales.commercial_proposals',
        column: 'proposal_number',
        date: '2026-09-15',
      },
      transaction,
    );
    expect(calls[1]!.replacements.prefijo).toBe('PROP-2026-%');
  });
});

describe('etiqueta del año fiscal', () => {
  it('año calendario', () => {
    expect(
      fiscalYearLabel(new Date('2026-01-01T00:00:00Z'), new Date('2026-12-31T00:00:00Z')),
    ).toBe('2026');
  });

  it('año que cruza de un calendario a otro', () => {
    expect(fiscalYearLabel('2026-04-01', '2027-03-31')).toBe('2026-2027');
  });
});
