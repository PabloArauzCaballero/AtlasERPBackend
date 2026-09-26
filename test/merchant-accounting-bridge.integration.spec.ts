/**
 * P-06 · Puente factura de comercio → mayor, contra PostgreSQL REAL y migrado.
 *
 * Qué demuestra (PLAN.md §5 P-06, aceptación):
 *  - dos llamadas simultáneas dejan UN documento por origen y ambas devuelven el mismo;
 *  - una caída entre crear el documento y enlazarlo a la factura no deja huérfanos, y un huérfano
 *    heredado de la versión anterior se recupera sin crear otro;
 *  - el puente genera un BORRADOR y nunca lo reporta como saldo contabilizado;
 *  - período cerrado, entidad ajena, partner ajeno, moneda mezclada e impuesto incoherente se
 *    rechazan sin escribir nada;
 *  - el reverso conserva la historia (original REVERSED intacto, reverso POSTED, factura enlazada).
 *
 * Sin base real la suite se SALTA y lo dice; con `REQUIRE_INTEGRATION_DB=true` (o `CI=true` en el
 * job de integración) falta de base es un FALLO. Se usa `DATABASE_URL` sólo si lo dio quien lanza
 * las pruebas: `test/set-env.ts` pone uno por defecto que no apunta a nada migrado.
 *
 * Uso: `DATABASE_URL=postgres://… REQUIRE_INTEGRATION_DB=true npx jest test/merchant-accounting-bridge.integration.spec.ts`
 * (la base debe venir migrada con `yarn db:migrate:prod`).
 */
import { randomUUID } from 'node:crypto';
import type { TestingModule } from '@nestjs/testing';
import type { Sequelize } from 'sequelize-typescript';
import type { AuthUser } from '../src/common/types/auth-context.types';
import type { MerchantAccountingBridgeService } from '../src/modules/b2b-sales-crm/services/merchant-accounting-bridge.service';
import type { AccountingDocumentsService } from '../src/modules/accounting/documents/services/accounting-documents.service';
import type { B2BBnplBillingService } from '../src/modules/b2b-sales-crm/services/b2b-bnpl-billing.service';

const DEFAULT_TEST_URL = 'postgres://postgres:postgres@localhost:5432/atlas_test';

function providedDatabaseUrl(): string | undefined {
  if (process.env.ATLAS_TEST_DATABASE_PROVIDED === 'false') return undefined;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return undefined;
  if (url === DEFAULT_TEST_URL && process.env.ATLAS_TEST_DATABASE_PROVIDED !== 'true') {
    return undefined;
  }
  return url;
}

const databaseUrl = providedDatabaseUrl();
const databaseRequired = process.env.REQUIRE_INTEGRATION_DB === 'true';

if (!databaseUrl && databaseRequired) {
  describe('P-06 puente factura → mayor (PostgreSQL real)', () => {
    it('requiere DATABASE_URL de una base migrada', () => {
      throw new Error('REQUIRE_INTEGRATION_DB=true y no hay DATABASE_URL: esto es un fallo.');
    });
  });
} else if (!databaseUrl) {
  console.warn('[integración] SALTADA P-06 puente factura → mayor: falta DATABASE_URL migrado.');
  describe.skip('P-06 puente factura → mayor [SALTADA: sin DATABASE_URL]', () => {
    it('no corre sin base', () => undefined);
  });
} else {
  describe('P-06 puente factura → mayor (PostgreSQL real)', () => {
    let moduleRef: TestingModule;
    let sequelize: Sequelize;
    let bridge: MerchantAccountingBridgeService;
    let documents: AccountingDocumentsService;
    let billing: B2BBnplBillingService;
    let invoiceModelClass: { prototype: { update: (...args: unknown[]) => unknown } };

    const admin: AuthUser = { sub: randomUUID(), role: 'admin', roles: ['admin'] };

    beforeAll(async () => {
      process.env.STARTUP_MIGRATIONS_ENABLED = 'false';
      process.env.STARTUP_SEEDS_ENABLED = 'false';
      process.env.DB_SSL ??= 'false';
      const { Test } = await import('@nestjs/testing');
      const { SequelizeModule, getConnectionToken } = await import('@nestjs/sequelize');
      const { DatabaseModule } = await import('../src/database/sequelize.module');
      const { ObservabilityModule } =
        await import('../src/common/observability/observability.module');
      const { PinoLoggerModule } = await import('../src/common/logging/pino-logger.module');
      const { LoggerModule } = await import('../src/common/logger/logger.module');
      const { AccountingModule } = await import('../src/modules/accounting/accounting.module');
      const models = await import('../src/modules/b2b-sales-crm/models/b2b-sales-crm.models');
      const { EventOutboxModel } = await import('../src/database/models');
      const bridgeModule =
        await import('../src/modules/b2b-sales-crm/services/merchant-accounting-bridge.service');
      const documentsModule =
        await import('../src/modules/accounting/documents/services/accounting-documents.service');
      const repositoryModule =
        await import('../src/modules/b2b-sales-crm/repositories/b2b-sales-crm.repository');
      const billingModule =
        await import('../src/modules/b2b-sales-crm/services/b2b-bnpl-billing.service');

      moduleRef = await Test.createTestingModule({
        imports: [
          ObservabilityModule,
          PinoLoggerModule,
          LoggerModule,
          DatabaseModule,
          AccountingModule,
          SequelizeModule.forFeature([...models.atlasSalesModels, EventOutboxModel]),
        ],
        providers: [
          bridgeModule.MerchantAccountingBridgeService,
          repositoryModule.B2BSalesCrmRepository,
          billingModule.B2BBnplBillingService,
        ],
      }).compile();
      await moduleRef.init();

      sequelize = moduleRef.get(getConnectionToken());
      bridge = moduleRef.get(bridgeModule.MerchantAccountingBridgeService);
      documents = moduleRef.get(documentsModule.AccountingDocumentsService);
      billing = moduleRef.get(billingModule.B2BBnplBillingService);
      invoiceModelClass = models.MerchantInvoiceModel as unknown as typeof invoiceModelClass;
    });

    afterAll(async () => {
      await moduleRef?.close();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    async function sql<T = Record<string, unknown>>(
      query: string,
      replacements: Record<string, unknown> = {},
    ): Promise<T[]> {
      const [rows] = await sequelize.query(query, { replacements });
      return rows as T[];
    }

    interface Fixture {
      legalEntityId: string;
      otherLegalEntityId: string;
      periodId: string;
      nextPeriodId: string;
      otherPeriodId: string;
      ledgerId: string;
      arAccountId: string;
      revenueAccountId: string;
      taxAccountId: string;
      partnerId: string;
      otherPartnerId: string;
      accountId: string;
      invoiceId: string;
    }

    /** Un mundo contable completo y aislado por sufijo: dos entidades, un comercio y su factura. */
    async function fixture(
      options: {
        currencies?: string[];
        headerTax?: string;
        contractOfOtherAccount?: boolean;
      } = {},
    ): Promise<Fixture> {
      const s = randomUUID().slice(0, 8).toUpperCase();
      const id = () => randomUUID();
      const f = {
        legalEntityId: id(),
        otherLegalEntityId: id(),
        periodId: id(),
        nextPeriodId: id(),
        otherPeriodId: id(),
        ledgerId: id(),
        arAccountId: id(),
        revenueAccountId: id(),
        taxAccountId: id(),
        partnerId: id(),
        otherPartnerId: id(),
        accountId: id(),
        invoiceId: id(),
      };
      const fy = id();
      const otherFy = id();
      const otherLedger = id();
      const coa = id();
      await sql(
        `INSERT INTO atlas_accounting.legal_entity (id, code, legal_name, base_currency)
         VALUES (:a, :ca, 'Entidad A', 'BOB'), (:b, :cb, 'Entidad B', 'BOB')`,
        { a: f.legalEntityId, b: f.otherLegalEntityId, ca: `A${s}`, cb: `B${s}` },
      );
      await sql(
        `INSERT INTO atlas_accounting.fiscal_year (id, legal_entity_id, year_label, start_date, end_date)
         VALUES (:fy, :a, '2026', '2026-01-01', '2026-12-31'), (:ofy, :b, '2026', '2026-01-01', '2026-12-31')`,
        { fy, ofy: otherFy, a: f.legalEntityId, b: f.otherLegalEntityId },
      );
      await sql(
        `INSERT INTO atlas_accounting.accounting_period (id, fiscal_year_id, period_no, start_date, end_date)
         VALUES (:p, :fy, 9, '2026-09-01', '2026-09-30'),
                (:n, :fy, 10, '2026-10-01', '2026-10-31'),
                (:o, :ofy, 9, '2026-09-01', '2026-09-30')`,
        { p: f.periodId, n: f.nextPeriodId, o: f.otherPeriodId, fy, ofy: otherFy },
      );
      await sql(
        `INSERT INTO atlas_accounting.ledger (id, legal_entity_id, code, name, accounting_basis, is_default)
         VALUES (:l, :a, 'LOCAL', 'Local', 'LOCAL_BO', true), (:ol, :b, 'LOCAL', 'Local', 'LOCAL_BO', true)`,
        { l: f.ledgerId, ol: otherLedger, a: f.legalEntityId, b: f.otherLegalEntityId },
      );
      await sql(
        `INSERT INTO atlas_accounting.chart_of_accounts (id, code, name, effective_from)
         VALUES (:coa, :code, 'Plan', '2026-01-01')`,
        { coa, code: `C${s}` },
      );
      await sql(
        `INSERT INTO atlas_accounting.gl_account (id, coa_id, account_no, name, account_type, normal_balance)
         VALUES (:ar, :coa, '1130', 'CxC comercios', 'ASSET', 'D'),
                (:rev, :coa, '4110', 'Ingreso MDR', 'REVENUE', 'C'),
                (:tax, :coa, '2140', 'IVA débito', 'LIABILITY', 'C')`,
        { ar: f.arAccountId, rev: f.revenueAccountId, tax: f.taxAccountId, coa },
      );
      await sql(
        `INSERT INTO atlas_accounting.business_partner (id, partner_no, partner_type, legal_name)
         VALUES (:p, :pn, 'COMPANY', 'Comercio A'), (:o, :on, 'COMPANY', 'Otro comercio')`,
        { p: f.partnerId, o: f.otherPartnerId, pn: `P${s}`, on: `O${s}` },
      );
      await sql(
        `INSERT INTO atlas_sales.b2b_accounts (id, legal_name, trade_name, category, business_line, business_partner_id)
         VALUES (:acc, 'Comercio A SRL', 'Comercio A', 'RETAIL', 'Electro', :bp)`,
        { acc: f.accountId, bp: f.partnerId },
      );
      let contractId: string | null = null;
      if (options.contractOfOtherAccount) {
        const otherAccount = id();
        contractId = id();
        await sql(
          `INSERT INTO atlas_sales.b2b_accounts (id, legal_name, trade_name, category, business_line)
           VALUES (:acc, 'Otro SRL', 'Otro', 'RETAIL', 'Electro')`,
          { acc: otherAccount },
        );
        await sql(
          `INSERT INTO atlas_sales.b2b_contracts (id, account_id, contract_number) VALUES (:c, :acc, :n)`,
          { c: contractId, acc: otherAccount, n: `CT-${s}` },
        );
      }
      const currencies = options.currencies ?? ['BOB'];
      const nets = currencies.map(() => '100.00');
      const subtotal = (100 * currencies.length).toFixed(2);
      const tax = options.headerTax ?? (13 * currencies.length).toFixed(2);
      const total = (Number(subtotal) + Number(tax)).toFixed(2);
      await sql(
        `INSERT INTO atlas_sales.merchant_invoices
           (id, account_id, contract_id, invoice_number, invoice_date, due_date,
            subtotal_amount, tax_amount, total_amount, status)
         VALUES (:i, :acc, :c, :n, '2026-09-15', '2026-10-15', :sub, :tax, :tot, 'ISSUED')`,
        {
          i: f.invoiceId,
          acc: f.accountId,
          c: contractId,
          n: `FAC-${s}`,
          sub: subtotal,
          tax,
          tot: total,
        },
      );
      for (const [index, currency] of currencies.entries()) {
        await sql(
          `INSERT INTO atlas_sales.merchant_receivables
             (account_id, invoice_id, source_type, amount_original, amount_open, currency, due_date)
           VALUES (:acc, :i, 'MDR', :net, :net, :cur, '2026-10-15')`,
          { acc: f.accountId, i: f.invoiceId, net: nets[index], cur: currency },
        );
        await sql(
          `INSERT INTO atlas_sales.merchant_invoice_lines
             (invoice_id, source_type, description, unit_amount, tax_amount, total_amount)
           VALUES (:i, 'MDR', 'Comisión MDR', :net, '13.00', '113.00')`,
          { i: f.invoiceId, net: nets[index] },
        );
      }
      return f;
    }

    function request(f: Fixture, overrides: Record<string, unknown> = {}) {
      return {
        legalEntityId: f.legalEntityId,
        accountingPeriodId: f.periodId,
        ledgerId: f.ledgerId,
        arAccountId: f.arAccountId,
        revenueAccountId: f.revenueAccountId,
        taxAccountId: f.taxAccountId,
        currencyCode: 'BOB',
        ...overrides,
      } as Parameters<MerchantAccountingBridgeService['postInvoiceToGl']>[1];
    }

    async function documentsForInvoice(invoiceId: string) {
      return sql<{ id: string; status: string; legal_entity_id: string }>(
        `SELECT id, status, legal_entity_id FROM atlas_accounting.accounting_document
          WHERE source_system = 'CRM' AND source_type = 'MERCHANT_INVOICE' AND source_id = :id`,
        { id: invoiceId },
      );
    }

    async function linkedDocumentId(invoiceId: string): Promise<string | null> {
      const [row] = await sql<{ accounting_document_id: string | null }>(
        `SELECT accounting_document_id FROM atlas_sales.merchant_invoices WHERE id = :id`,
        { id: invoiceId },
      );
      return row?.accounting_document_id ?? null;
    }

    /** Saldo CONTABILIZADO de una cuenta: sólo asientos publicados (POSTED o ya reversados). */
    async function postedBalance(glAccountId: string): Promise<string> {
      const [row] = await sql<{ balance: string }>(
        `SELECT COALESCE(SUM(l.debit - l.credit), 0)::numeric(18,2)::text AS balance
           FROM atlas_accounting.journal_entry_line l
           JOIN atlas_accounting.journal_entry j ON j.id = l.journal_entry_id
          WHERE l.gl_account_id = :gl AND j.posting_status IN ('POSTED', 'REVERSED')`,
        { gl: glAccountId },
      );
      return row!.balance;
    }

    async function codeOf(work: Promise<unknown>): Promise<string> {
      try {
        await work;
      } catch (error) {
        const response = (error as { getResponse?: () => unknown }).getResponse?.();
        const code = (response as { code?: string } | undefined)?.code;
        return code ?? (error as Error).message;
      }
      throw new Error('Se esperaba un rechazo y la operación se aceptó.');
    }

    it('genera un BORRADOR que no se reporta como saldo contabilizado', async () => {
      const f = await fixture();
      const result = await bridge.postInvoiceToGl(f.invoiceId, request(f), admin);

      expect(result).toMatchObject({
        merchantInvoiceId: f.invoiceId,
        accountingDocumentStatus: 'DRAFT',
        postedToLedger: false,
        outcome: 'DRAFT_CREATED',
      });
      expect(await postedBalance(f.arAccountId)).toBe('0.00');
      expect(await linkedDocumentId(f.invoiceId)).toBe(result.accountingDocumentId);

      await documents.postDocument(result.accountingDocumentId, admin);
      expect(await postedBalance(f.arAccountId)).toBe('113.00');
      expect(await postedBalance(f.revenueAccountId)).toBe('-100.00');
      expect(await postedBalance(f.taxAccountId)).toBe('-13.00');
    });

    it('dos llamadas simultáneas dejan un solo documento por origen y devuelven el mismo', async () => {
      const f = await fixture();
      const [first, second] = await Promise.all([
        bridge.postInvoiceToGl(f.invoiceId, request(f), admin),
        bridge.postInvoiceToGl(f.invoiceId, request(f), admin),
      ]);

      const docs = await documentsForInvoice(f.invoiceId);
      expect(docs).toHaveLength(1);
      expect(first.accountingDocumentId).toBe(docs[0]!.id);
      expect(second.accountingDocumentId).toBe(docs[0]!.id);
      expect([first.outcome, second.outcome].sort()).toEqual([
        'DRAFT_CREATED',
        'EXISTING_DOCUMENT_RETURNED',
      ]);
    });

    it('una segunda llamada secuencial es idempotente', async () => {
      const f = await fixture();
      const first = await bridge.postInvoiceToGl(f.invoiceId, request(f), admin);
      const again = await bridge.postInvoiceToGl(f.invoiceId, request(f), admin);
      expect(again.accountingDocumentId).toBe(first.accountingDocumentId);
      expect(again.outcome).toBe('EXISTING_DOCUMENT_RETURNED');
      expect(await documentsForInvoice(f.invoiceId)).toHaveLength(1);
    });

    it('caída entre la creación y el enlace no deja documentos huérfanos', async () => {
      const f = await fixture();
      const update = invoiceModelClass.prototype.update;
      jest
        .spyOn(invoiceModelClass.prototype, 'update')
        .mockImplementationOnce(() => Promise.reject(new Error('caída simulada')));

      await expect(bridge.postInvoiceToGl(f.invoiceId, request(f), admin)).rejects.toThrow(
        'caída simulada',
      );
      expect(await documentsForInvoice(f.invoiceId)).toHaveLength(0);
      expect(await linkedDocumentId(f.invoiceId)).toBeNull();

      invoiceModelClass.prototype.update = update;
      jest.restoreAllMocks();
      const retry = await bridge.postInvoiceToGl(f.invoiceId, request(f), admin);
      expect(retry.outcome).toBe('DRAFT_CREATED');
      expect(await documentsForInvoice(f.invoiceId)).toHaveLength(1);
    });

    it('recupera el documento huérfano de un intento anterior sin crear otro', async () => {
      const f = await fixture();
      const orphan = await documents.createDraft(
        {
          legalEntityId: f.legalEntityId,
          sourceSystem: 'CRM',
          sourceType: 'MERCHANT_INVOICE',
          sourceId: f.invoiceId,
          documentType: 'AR_INVOICE',
          documentNo: `MINV-ORPHAN-${f.invoiceId.slice(0, 8)}`,
          documentDate: new Date('2026-09-15'),
          postingDate: new Date('2026-09-15'),
          accountingPeriodId: f.periodId,
          ledgerId: f.ledgerId,
          currencyCode: 'BOB',
          approvalStatus: 'NOT_REQUIRED',
          lines: [
            {
              glAccountId: f.arAccountId,
              debit: 113,
              credit: 0,
              currencyCode: 'BOB',
              amountLc: 113,
            },
            {
              glAccountId: f.revenueAccountId,
              debit: 0,
              credit: 100,
              currencyCode: 'BOB',
              amountLc: 100,
            },
            {
              glAccountId: f.taxAccountId,
              debit: 0,
              credit: 13,
              currencyCode: 'BOB',
              amountLc: 13,
            },
          ],
        },
        admin,
      );

      const result = await bridge.postInvoiceToGl(f.invoiceId, request(f), admin);
      expect(result.accountingDocumentId).toBe(orphan.document.id);
      expect(result.outcome).toBe('ORPHAN_DOCUMENT_LINKED');
      expect(await documentsForInvoice(f.invoiceId)).toHaveLength(1);
      expect(await linkedDocumentId(f.invoiceId)).toBe(orphan.document.id);
    });

    it('la base impide un segundo documento para el mismo origen aunque sea en otro libro', async () => {
      const f = await fixture();
      await bridge.postInvoiceToGl(f.invoiceId, request(f), admin);
      const otherLedger = randomUUID();
      await sql(
        `INSERT INTO atlas_accounting.ledger (id, legal_entity_id, code, name, accounting_basis)
         VALUES (:l, :a, 'IFRS', 'IFRS', 'IFRS')`,
        { l: otherLedger, a: f.legalEntityId },
      );
      const violation = await sql(
        `INSERT INTO atlas_accounting.accounting_document
           (legal_entity_id, source_system, source_type, source_id, document_type, document_no,
            document_date, posting_date, accounting_period_id, ledger_id)
         VALUES (:a, 'CRM', 'MERCHANT_INVOICE', :src, 'AR_INVOICE', 'DUP-1',
                 '2026-09-15', '2026-09-15', :p, :l)`,
        { a: f.legalEntityId, src: f.invoiceId, p: f.periodId, l: otherLedger },
      ).then(
        () => null,
        (error: { parent?: { constraint?: string } }) => error.parent?.constraint ?? null,
      );
      expect(violation).toBe('uq_accounting_document_merchant_invoice_origin');
      expect(await documentsForInvoice(f.invoiceId)).toHaveLength(1);
    });

    it('rechaza un período cerrado sin escribir nada', async () => {
      const f = await fixture();
      await sql(
        `UPDATE atlas_accounting.accounting_period SET is_open = false, close_status = 'CLOSED' WHERE id = :p`,
        { p: f.periodId },
      );
      expect(await codeOf(bridge.postInvoiceToGl(f.invoiceId, request(f), admin))).toBe(
        'ACCOUNTING_PERIOD_CLOSED',
      );
      expect(await documentsForInvoice(f.invoiceId)).toHaveLength(0);
      expect(await linkedDocumentId(f.invoiceId)).toBeNull();
    });

    it('rechaza una entidad legal ajena al usuario sin escribir nada', async () => {
      const f = await fixture();
      const scoped: AuthUser = {
        sub: randomUUID(),
        role: 'accountant',
        legalEntityIds: [f.otherLegalEntityId],
      };
      expect(await codeOf(bridge.postInvoiceToGl(f.invoiceId, request(f), scoped))).toBe(
        'LEGAL_ENTITY_FORBIDDEN',
      );
      expect(await documentsForInvoice(f.invoiceId)).toHaveLength(0);
    });

    it('rechaza período y libro de otra entidad legal', async () => {
      const f = await fixture();
      expect(
        await codeOf(
          bridge.postInvoiceToGl(
            f.invoiceId,
            request(f, { accountingPeriodId: f.otherPeriodId }),
            admin,
          ),
        ),
      ).toBe('PERIOD_LEGAL_ENTITY_MISMATCH');
      expect(await documentsForInvoice(f.invoiceId)).toHaveLength(0);
    });

    it('no devuelve a un usuario de otra entidad el documento ya enlazado', async () => {
      const f = await fixture();
      await bridge.postInvoiceToGl(f.invoiceId, request(f), admin);
      const scoped: AuthUser = {
        sub: randomUUID(),
        role: 'accountant',
        legalEntityIds: [f.otherLegalEntityId],
      };
      expect(
        await codeOf(
          bridge.postInvoiceToGl(
            f.invoiceId,
            request(f, { legalEntityId: f.otherLegalEntityId }),
            scoped,
          ),
        ),
      ).toBe('LEGAL_ENTITY_FORBIDDEN');
    });

    it('rechaza un partner distinto del de la factura aunque lo envíe el cliente', async () => {
      const f = await fixture();
      expect(
        await codeOf(
          bridge.postInvoiceToGl(f.invoiceId, request(f, { partnerId: f.otherPartnerId }), admin),
        ),
      ).toBe('MERCHANT_INVOICE_PARTNER_MISMATCH');
      expect(await documentsForInvoice(f.invoiceId)).toHaveLength(0);
    });

    it('rechaza una factura con cargos en monedas mezcladas', async () => {
      const f = await fixture({ currencies: ['BOB', 'USD'] });
      expect(await codeOf(bridge.postInvoiceToGl(f.invoiceId, request(f), admin))).toBe(
        'MERCHANT_INVOICE_MIXED_CURRENCIES',
      );
      expect(await documentsForInvoice(f.invoiceId)).toHaveLength(0);
    });

    it('rechaza una moneda distinta de la de la factura', async () => {
      const f = await fixture();
      expect(
        await codeOf(
          bridge.postInvoiceToGl(f.invoiceId, request(f, { currencyCode: 'USD' }), admin),
        ),
      ).toBe('MERCHANT_INVOICE_CURRENCY_MISMATCH');
    });

    it('rechaza una factura cuyo impuesto no cuadra con sus líneas', async () => {
      const f = await fixture({ headerTax: '12.99' });
      expect(await codeOf(bridge.postInvoiceToGl(f.invoiceId, request(f), admin))).toBe(
        'MERCHANT_INVOICE_TAX_INCONSISTENT',
      );
      expect(await documentsForInvoice(f.invoiceId)).toHaveLength(0);
    });

    it('rechaza una factura cuyo contrato es de otro comercio', async () => {
      const f = await fixture({ contractOfOtherAccount: true });
      expect(await codeOf(bridge.postInvoiceToGl(f.invoiceId, request(f), admin))).toBe(
        'MERCHANT_INVOICE_CONTRACT_MISMATCH',
      );
    });

    it('el reverso conserva la historia y el puente no crea otro documento', async () => {
      const f = await fixture();
      const draft = await bridge.postInvoiceToGl(f.invoiceId, request(f), admin);
      await documents.postDocument(draft.accountingDocumentId, admin);
      const reversal = await documents.reverseDocument(
        draft.accountingDocumentId,
        { reversalDate: new Date('2026-10-02'), reason: 'Factura anulada' },
        admin,
      );

      const [original] = await sql<{ status: string; reversed_by_id: string }>(
        `SELECT status, reversed_by_id FROM atlas_accounting.accounting_document WHERE id = :id`,
        { id: draft.accountingDocumentId },
      );
      expect(original).toMatchObject({ status: 'REVERSED', reversed_by_id: reversal.document.id });
      const originalLines = await sql<{ debit: string; credit: string }>(
        `SELECT l.debit, l.credit FROM atlas_accounting.journal_entry_line l
           JOIN atlas_accounting.journal_entry j ON j.id = l.journal_entry_id
          WHERE j.accounting_document_id = :id ORDER BY l.line_no`,
        { id: draft.accountingDocumentId },
      );
      expect(originalLines).toEqual([
        { debit: '113.00', credit: '0.00' },
        { debit: '0.00', credit: '100.00' },
        { debit: '0.00', credit: '13.00' },
      ]);
      expect(reversal.document.status).toBe('POSTED');
      expect(await postedBalance(f.arAccountId)).toBe('0.00');

      const again = await bridge.postInvoiceToGl(f.invoiceId, request(f), admin);
      expect(again).toMatchObject({
        accountingDocumentId: draft.accountingDocumentId,
        accountingDocumentStatus: 'REVERSED',
        postedToLedger: false,
        outcome: 'EXISTING_DOCUMENT_RETURNED',
      });
      expect(await documentsForInvoice(f.invoiceId)).toHaveLength(1);
    });

    it('no publica un documento con aprobación pendiente', async () => {
      const f = await fixture();
      const pending = await documents.createDraft(
        {
          legalEntityId: f.legalEntityId,
          sourceSystem: 'ATLAS_ERP',
          sourceType: 'MANUAL',
          documentType: 'JOURNAL',
          documentDate: new Date('2026-09-15'),
          accountingPeriodId: f.periodId,
          ledgerId: f.ledgerId,
          currencyCode: 'BOB',
          approvalStatus: 'PENDING',
          lines: [
            { glAccountId: f.arAccountId, debit: 10, credit: 0, currencyCode: 'BOB', amountLc: 10 },
            {
              glAccountId: f.revenueAccountId,
              debit: 0,
              credit: 10,
              currencyCode: 'BOB',
              amountLc: 10,
            },
          ],
        },
        admin,
      );
      expect(await codeOf(documents.postDocument(pending.document.id, admin))).toBe(
        'ACCOUNTING_DOCUMENT_APPROVAL_REQUIRED',
      );
    });

    it('asienta el importe máximo de la columna sin perder céntimos', async () => {
      const f = await fixture();
      await sql(
        `UPDATE atlas_sales.merchant_invoices
            SET subtotal_amount = '9999999999999999.99', tax_amount = '0.00', total_amount = '9999999999999999.99'
          WHERE id = :i`,
        { i: f.invoiceId },
      );
      await sql(
        `UPDATE atlas_sales.merchant_invoice_lines SET unit_amount = '9999999999999999.99',
                tax_amount = '0.00', total_amount = '9999999999999999.99' WHERE invoice_id = :i`,
        { i: f.invoiceId },
      );
      const result = await bridge.postInvoiceToGl(f.invoiceId, request(f), admin);
      const lines = await sql<{ debit: string; credit: string; amount_lc: string }>(
        `SELECT l.debit, l.credit, l.amount_lc FROM atlas_accounting.journal_entry_line l
           JOIN atlas_accounting.journal_entry j ON j.id = l.journal_entry_id
          WHERE j.accounting_document_id = :id ORDER BY l.line_no`,
        { id: result.accountingDocumentId },
      );
      expect(lines).toEqual([
        { debit: '9999999999999999.99', credit: '0.00', amount_lc: '9999999999999999.99' },
        { debit: '0.00', credit: '9999999999999999.99', amount_lc: '9999999999999999.99' },
      ]);
    });
    /** Comercio operativo con sucursal habilitada y contrato vigente con una regla MDR. */
    async function merchantWithContract(rate: string) {
      const s = randomUUID().slice(0, 8).toUpperCase();
      const accountId = randomUUID();
      const branchId = randomUUID();
      const contractId = randomUUID();
      const versionId = randomUUID();
      const ruleId = randomUUID();
      await sql(
        `INSERT INTO atlas_sales.b2b_accounts (id, legal_name, trade_name, category, business_line, lifecycle_status)
         VALUES (:acc, 'Comercio MDR SRL', 'Comercio MDR', 'RETAIL', 'Electro', 'CUSTOMER')`,
        { acc: accountId },
      );
      await sql(
        `INSERT INTO atlas_sales.merchant_branches (id, account_id, name, city, status, can_originate_bnpl)
         VALUES (:b, :acc, 'Central', 'La Paz', 'ACTIVE', true)`,
        { b: branchId, acc: accountId },
      );
      await sql(
        `INSERT INTO atlas_sales.b2b_contracts (id, account_id, contract_number, status, start_date)
         VALUES (:c, :acc, :n, 'ACTIVE', '2026-01-01')`,
        { c: contractId, acc: accountId, n: `CT-${s}` },
      );
      await sql(
        `INSERT INTO atlas_sales.contract_versions (id, contract_id, version_number, valid_from, status)
         VALUES (:v, :c, 1, '2026-01-01', 'ACTIVE')`,
        { v: versionId, c: contractId },
      );
      await sql(
        `INSERT INTO atlas_sales.mdr_rules (id, contract_version_id, rate_percent) VALUES (:r, :v, :rate)`,
        { r: ruleId, v: versionId, rate },
      );
      return { accountId, branchId, versionId, ruleId };
    }

    it('jornada: la compra guarda cuotas 400+300+300 y conserva su MDR aunque la regla cambie', async () => {
      const m = await merchantWithContract('2.345678');
      const created = (await billing.registerPurchase({
        merchantAccountId: m.accountId,
        branchId: m.branchId,
        consumerExternalRef: `CI-${randomUUID().slice(0, 8)}`,
        purchaseAmount: 2500,
        downPaymentAmount: 1500,
        financedAmount: 1000,
        mdrReceivableDueDate: '2026-10-31',
        installments: [
          { installmentNumber: 1, dueDate: '2026-10-15', amount: 400 },
          { installmentNumber: 2, dueDate: '2026-11-15', amount: 300 },
          { installmentNumber: 3, dueDate: '2026-12-15', amount: 300 },
        ],
      })) as { purchase: { id: string }; receivable: { id: string } };

      await sql(`UPDATE atlas_sales.mdr_rules SET rate_percent = 5 WHERE id = :r`, { r: m.ruleId });

      const [purchase] = await sql<Record<string, string>>(
        `SELECT contract_version_id, mdr_rate_percent, mdr_amount, mdr_rule_id, mdr_pricing_source,
                (SELECT sum(amount)::text FROM atlas_sales.bnpl_installments WHERE purchase_id = p.id) AS installments_total
           FROM atlas_sales.bnpl_purchases p WHERE id = :id`,
        { id: created.purchase.id },
      );
      expect(purchase).toEqual({
        contract_version_id: m.versionId,
        mdr_rate_percent: '2.345678',
        mdr_amount: '58.64',
        mdr_rule_id: m.ruleId,
        mdr_pricing_source: 'mdr_rules',
        installments_total: '1000.00',
      });

      const invoice = (await billing.issueInvoice({
        accountId: m.accountId,
        invoiceDate: '2026-09-30',
        dueDate: '2026-10-30',
        receivableIds: [created.receivable.id],
      })) as { subtotalAmount: string };
      expect(invoice.subtotalAmount).toBe('58.64');
    });

    it('emitir factura con cargos en monedas distintas se rechaza sin escribir', async () => {
      const m = await merchantWithContract('2');
      const ids = [randomUUID(), randomUUID()];
      for (const [index, currency] of ['BOB', 'USD'].entries()) {
        await sql(
          `INSERT INTO atlas_sales.merchant_receivables
             (id, account_id, source_type, amount_original, amount_open, currency, due_date)
           VALUES (:id, :acc, 'MDR', '10.00', '10.00', :cur, '2026-10-15')`,
          { id: ids[index], acc: m.accountId, cur: currency },
        );
      }
      expect(
        await codeOf(
          billing.issueInvoice({
            accountId: m.accountId,
            invoiceDate: '2026-09-30',
            dueDate: '2026-10-30',
            receivableIds: ids,
          }),
        ),
      ).toBe('MIXED_CURRENCIES');
      const [row] = await sql<{ n: string }>(
        `SELECT count(*)::text AS n FROM atlas_sales.merchant_invoices WHERE account_id = :acc`,
        { acc: m.accountId },
      );
      expect(row!.n).toBe('0');
    });

    it('factura de céntimos: el IVA de las líneas suma el de la cabecera y el asiento cuadra', async () => {
      const f = await fixture();
      const ids = [randomUUID(), randomUUID(), randomUUID()];
      for (const receivableId of ids) {
        await sql(
          `INSERT INTO atlas_sales.merchant_receivables
             (id, account_id, source_type, amount_original, amount_open, currency, due_date)
           VALUES (:id, :acc, 'MDR', '0.10', '0.10', 'BOB', '2026-10-15')`,
          { id: receivableId, acc: f.accountId },
        );
      }
      const invoice = (await billing.issueInvoice({
        accountId: f.accountId,
        invoiceDate: '2026-09-15',
        dueDate: '2026-10-15',
        receivableIds: ids,
      })) as { id: string; subtotalAmount: string; taxAmount: string; totalAmount: string };
      expect(invoice).toMatchObject({
        subtotalAmount: '0.30',
        taxAmount: '0.04',
        totalAmount: '0.34',
      });
      const [lines] = await sql<{ tax: string; total: string }>(
        `SELECT sum(tax_amount)::text AS tax, sum(total_amount)::text AS total
           FROM atlas_sales.merchant_invoice_lines WHERE invoice_id = :i`,
        { i: invoice.id },
      );
      expect(lines).toEqual({ tax: '0.04', total: '0.34' });

      const draft = await bridge.postInvoiceToGl(invoice.id, request(f), admin);
      await documents.postDocument(draft.accountingDocumentId, admin);
      const [balance] = await sql<{ debit: string; credit: string }>(
        `SELECT sum(l.debit)::text AS debit, sum(l.credit)::text AS credit
           FROM atlas_accounting.journal_entry_line l
           JOIN atlas_accounting.journal_entry j ON j.id = l.journal_entry_id
          WHERE j.accounting_document_id = :id`,
        { id: draft.accountingDocumentId },
      );
      expect(balance).toEqual({ debit: '0.34', credit: '0.34' });
    });
  });
}
