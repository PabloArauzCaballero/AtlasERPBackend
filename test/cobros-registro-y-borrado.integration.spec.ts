/**
 * WP14-ERPB · Factura AR y recibo contra PostgreSQL real: emitir y cobrar quedan en el registro de
 * actividad, y ninguno de los dos se puede borrar después (el asiento ya está en el mayor).
 */
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import type { Sequelize } from 'sequelize-typescript';
import type { AuthUser } from '../src/common/types/auth-context.types';
import type { BillingService } from '../src/modules/accounting/billing/services/billing.service';
import type { ReceiptsService } from '../src/modules/accounting/receipts/services/receipts.service';
import { describeWithDatabase } from './integration/database';

describeWithDatabase('factura AR y recibo: registro y borrado (PostgreSQL real)', (url) => {
  let moduleRef: TestingModule;
  let sequelize: Sequelize;
  let billing: BillingService;
  let receipts: ReceiptsService;
  const admin: AuthUser = { sub: randomUUID(), role: 'admin', roles: ['admin'] };

  async function sql<T = Record<string, unknown>>(
    query: string,
    replacements: Record<string, unknown> = {},
  ): Promise<T[]> {
    const [rows] = await sequelize.query(query, { replacements });
    return rows as T[];
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.STARTUP_MIGRATIONS_ENABLED = 'false';
    process.env.STARTUP_SEEDS_ENABLED = 'false';
    process.env.DB_SSL ??= 'false';
    const { Test } = await import('@nestjs/testing');
    const { getConnectionToken } = await import('@nestjs/sequelize');
    const { DatabaseModule } = await import('../src/database/sequelize.module');
    const { ObservabilityModule } =
      await import('../src/common/observability/observability.module');
    const { PinoLoggerModule } = await import('../src/common/logging/pino-logger.module');
    const { LoggerModule } = await import('../src/common/logger/logger.module');
    const { AccountingModule } = await import('../src/modules/accounting/accounting.module');
    const billingModule =
      await import('../src/modules/accounting/billing/services/billing.service');
    const receiptsModule =
      await import('../src/modules/accounting/receipts/services/receipts.service');
    moduleRef = await Test.createTestingModule({
      imports: [
        ObservabilityModule,
        PinoLoggerModule,
        LoggerModule,
        DatabaseModule,
        AccountingModule,
      ],
    }).compile();
    await moduleRef.init();
    sequelize = moduleRef.get(getConnectionToken());
    billing = moduleRef.get(billingModule.BillingService);
    receipts = moduleRef.get(receiptsModule.ReceiptsService);
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('emitir y cobrar se registran; borrar la factura o el recibo contabilizados es 409', async () => {
    const s = randomUUID().slice(0, 8).toUpperCase();
    const id = () => randomUUID();
    const f = {
      le: id(),
      fy: id(),
      period: id(),
      ledger: id(),
      coa: id(),
      ar: id(),
      rev: id(),
      bank: id(),
      bp: id(),
    };
    const hoy = new Date().toISOString().slice(0, 10);
    const [anio, mes] = hoy.split('-');
    const fin = new Date(Date.UTC(Number(anio), Number(mes), 0)).toISOString().slice(0, 10);
    await sql(
      `INSERT INTO atlas_accounting.legal_entity (id, code, legal_name, base_currency)
       VALUES (:le, :code, 'Entidad cobros', 'BOB')`,
      { le: f.le, code: `CB${s}` },
    );
    await sql(
      `INSERT INTO atlas_accounting.fiscal_year (id, legal_entity_id, year_label, start_date, end_date)
       VALUES (:fy, :le, :anio, :ini, :finAnio)`,
      { fy: f.fy, le: f.le, anio, ini: `${anio}-01-01`, finAnio: `${anio}-12-31` },
    );
    await sql(
      `INSERT INTO atlas_accounting.accounting_period (id, fiscal_year_id, period_no, start_date, end_date)
       VALUES (:p, :fy, :n, :ini, :fin)`,
      { p: f.period, fy: f.fy, n: Number(mes), ini: `${anio}-${mes}-01`, fin },
    );
    await sql(
      `INSERT INTO atlas_accounting.ledger (id, legal_entity_id, code, name, accounting_basis, is_default)
       VALUES (:l, :le, 'LOCAL', 'Local', 'LOCAL_BO', true)`,
      { l: f.ledger, le: f.le },
    );
    await sql(
      `INSERT INTO atlas_accounting.chart_of_accounts (id, code, name, effective_from)
       VALUES (:coa, :code, 'Plan', '2020-01-01')`,
      { coa: f.coa, code: `C${s}` },
    );
    await sql(
      `INSERT INTO atlas_accounting.gl_account (id, coa_id, account_no, name, account_type, normal_balance)
       VALUES (:ar, :coa, '1130', 'CxC', 'ASSET', 'D'),
              (:rev, :coa, '4110', 'Ingreso', 'REVENUE', 'C'),
              (:bank, :coa, '1110', 'Banco', 'ASSET', 'D')`,
      { ar: f.ar, rev: f.rev, bank: f.bank, coa: f.coa },
    );
    await sql(
      `INSERT INTO atlas_accounting.business_partner (id, partner_no, partner_type, legal_name)
       VALUES (:bp, :pn, 'COMPANY', 'Cliente cobros')`,
      { bp: f.bp, pn: `P${s}` },
    );
    await sql(
      `INSERT INTO atlas_accounting.business_partner_role (business_partner_id, legal_entity_id, role_code)
       VALUES (:bp, :le, 'CUSTOMER')`,
      { bp: f.bp, le: f.le },
    );

    const emitida = await billing.issueInvoice(
      {
        legalEntityId: f.le,
        customerBpId: f.bp,
        invoiceDate: new Date(`${hoy}T12:00:00.000Z`),
        dueDate: new Date(`${fin}T12:00:00.000Z`),
        currencyCode: 'BOB',
        netAmount: 100,
        taxAmount: 0,
        arAccountId: f.ar,
        revenueAccountId: f.rev,
        description: 'Servicio de prueba',
        accountingPeriodId: f.period,
        ledgerId: f.ledger,
      } as never,
      admin,
    );
    const facturaId = emitida.invoice.id;

    const cobro = await receipts.record(
      {
        legalEntityId: f.le,
        payerBpId: f.bp,
        receiptDate: new Date(`${hoy}T12:00:00.000Z`),
        amount: 100,
        currencyCode: 'BOB',
        bankGlAccountId: f.bank,
        arControlGlAccountId: f.ar,
        accountingPeriodId: f.period,
        ledgerId: f.ledger,
        allocations: [{ arInvoiceId: facturaId, allocatedAmount: 100 }],
      } as never,
      admin,
    );
    const reciboId = cobro.receipt.id;

    const registro = await sql<{ action_code: string; aggregate_id: string }>(
      `SELECT action_code, aggregate_id FROM atlas_audit.business_action_logs
        WHERE aggregate_id IN (:facturaId, :reciboId) ORDER BY created_at`,
      { facturaId, reciboId },
    );
    expect(registro).toEqual([
      { action_code: 'ISSUE_AR_INVOICE', aggregate_id: facturaId },
      { action_code: 'RECORD_RECEIPT', aggregate_id: reciboId },
    ]);

    await expect(receipts.remove(reciboId, admin)).rejects.toBeInstanceOf(ConflictException);
    await expect(billing.deleteInvoice(facturaId, admin)).rejects.toMatchObject({
      response: { code: 'AR_INVOICE_HAS_ACCOUNTING_TRACE' },
    });
    const [quedan] = await sql<{ facturas: string; recibos: string; cobros: string }>(
      `SELECT
         (SELECT count(*) FROM atlas_accounting.ar_invoice WHERE id = :facturaId)::text AS facturas,
         (SELECT count(*) FROM atlas_accounting.receipt WHERE id = :reciboId)::text AS recibos,
         (SELECT count(*) FROM atlas_accounting.receipt_allocation WHERE receipt_id = :reciboId)::text AS cobros`,
      { facturaId, reciboId },
    );
    expect(quedan).toEqual({ facturas: '1', recibos: '1', cobros: '1' });
  });
});
