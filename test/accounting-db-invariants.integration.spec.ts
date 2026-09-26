import type { Client } from 'pg';
import { connect, describeWithDatabase, expectPgError, uniqueSuffix } from './integration/database';

/**
 * Controles financieros de la BASE, probados contra PostgreSQL migrado por `yarn db:migrate:prod`
 * (P-12 / B16). Cada prueba INTENTA violar una restricción de
 * `src/database/sql/accounting/00{1,2}_*.sql` con SQL directo —sin pasar por los servicios— y exige
 * el error concreto. Si alguien quita un trigger o un índice único, la prueba correspondiente se
 * pone roja: es el gate que faltaba (antes el CI arrancaba la API con las migraciones desactivadas).
 *
 * Cada corrida crea su propia entidad legal con un sufijo único, así que puede repetirse sobre la
 * misma base sin limpiar (los documentos POSTED no se pueden borrar: es justo lo que se prueba).
 */

interface Fixture {
  legalEntityId: string;
  openPeriodId: string;
  closedPeriodId: string;
  ledgerId: string;
  cashAccountId: string;
  revenueAccountId: string;
  customerId: string;
  contractId: string;
}

const OPEN_DAY = '2026-01-15';
const CLOSED_DAY = '2025-12-15';

describeWithDatabase('Invariantes contables en PostgreSQL (accounting-db-invariants)', (url) => {
  let db: Client;
  let fx: Fixture;
  let suffix: string;
  let seq = 0;

  const next = (prefix: string): string => `${prefix}-${suffix}-${++seq}`;

  beforeAll(async () => {
    db = await connect(url);
    await db.query('SET search_path TO atlas_accounting, public');
    suffix = uniqueSuffix();
    fx = await createFixture(db, suffix);
  });

  afterAll(async () => {
    await db?.end();
  });

  /** Inserta documento + asiento + líneas en UNA transacción y la confirma (o lanza). */
  async function insertJournal(options: {
    periodId?: string;
    postingDate?: string;
    lines: Array<{ debit: string; credit: string }>;
    status?: 'DRAFT' | 'POSTED';
    sourceId?: string;
    reversalOfId?: string;
  }): Promise<{ documentId: string; journalId: string }> {
    await db.query('BEGIN');
    try {
      const doc = await db.query<{ id: string }>(
        `INSERT INTO accounting_document
           (legal_entity_id, source_system, source_type, source_id, document_type, document_no,
            document_date, posting_date, accounting_period_id, ledger_id, status, reversal_of_id)
         VALUES ($1, 'CI', 'INVARIANT', $2, 'JE', $3, $4, $4, $5, $6, 'DRAFT', $7)
         RETURNING id`,
        [
          fx.legalEntityId,
          options.sourceId ?? next('SRC'),
          next('DOC'),
          options.postingDate ?? OPEN_DAY,
          options.periodId ?? fx.openPeriodId,
          fx.ledgerId,
          options.reversalOfId ?? null,
        ],
      );
      const documentId = doc.rows[0]!.id;
      const journal = await db.query<{ id: string }>(
        `INSERT INTO journal_entry (accounting_document_id, journal_no) VALUES ($1, $2) RETURNING id`,
        [documentId, next('JE')],
      );
      const journalId = journal.rows[0]!.id;
      let lineNo = 0;
      for (const line of options.lines) {
        lineNo += 1;
        await db.query(
          `INSERT INTO journal_entry_line (journal_entry_id, line_no, gl_account_id, debit, credit)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            journalId,
            lineNo,
            Number(line.debit) > 0 ? fx.cashAccountId : fx.revenueAccountId,
            line.debit,
            line.credit,
          ],
        );
      }
      if (options.status === 'POSTED') {
        await db.query(
          `UPDATE journal_entry SET posting_status = 'POSTED', posted_at = now(), hash_sha256 = $2
           WHERE id = $1`,
          [journalId, 'a'.repeat(64)],
        );
        await db.query(`UPDATE accounting_document SET status = 'POSTED' WHERE id = $1`, [
          documentId,
        ]);
      }
      await db.query('COMMIT');
      return { documentId, journalId };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  }

  describe('doble partida', () => {
    it('acepta un asiento cuadrado', async () => {
      const { journalId } = await insertJournal({
        lines: [
          { debit: '100.00', credit: '0' },
          { debit: '0', credit: '100.00' },
        ],
      });
      const lines = await db.query('SELECT 1 FROM journal_entry_line WHERE journal_entry_id = $1', [
        journalId,
      ]);
      expect(lines.rowCount).toBe(2);
    });

    it('rechaza al confirmar un asiento descuadrado (UNBALANCED_JOURNAL)', async () => {
      const error = await expectPgError(() =>
        insertJournal({
          lines: [
            { debit: '100.00', credit: '0' },
            { debit: '0', credit: '99.99' },
          ],
        }),
      );
      expect(error.message).toContain('UNBALANCED_JOURNAL');
    });

    it('rechaza descuadrar un asiento ya cuadrado borrando una línea', async () => {
      const { journalId } = await insertJournal({
        lines: [
          { debit: '10.00', credit: '0' },
          { debit: '0', credit: '10.00' },
        ],
      });
      const error = await expectPgError(async () => {
        await db.query('BEGIN');
        try {
          await db.query(
            'DELETE FROM journal_entry_line WHERE journal_entry_id = $1 AND line_no = 2',
            [journalId],
          );
          await db.query('COMMIT');
        } catch (inner) {
          await db.query('ROLLBACK');
          throw inner;
        }
      });
      expect(error.message).toContain('UNBALANCED_JOURNAL');
    });

    it('rechaza una línea con débito y crédito a la vez (CHECK de línea)', async () => {
      const error = await expectPgError(() =>
        insertJournal({
          lines: [
            { debit: '5.00', credit: '5.00' },
            { debit: '0', credit: '0' },
          ],
        }),
      );
      expect(error.code).toBe('23514');
    });
  });

  describe('inmutabilidad de lo publicado (POSTED)', () => {
    let posted: { documentId: string; journalId: string };

    beforeAll(async () => {
      posted = await insertJournal({
        status: 'POSTED',
        lines: [
          { debit: '50.00', credit: '0' },
          { debit: '0', credit: '50.00' },
        ],
      });
    });

    it('rechaza modificar un documento POSTED', async () => {
      const error = await expectPgError(() =>
        db.query(`UPDATE accounting_document SET document_date = document_date - 1 WHERE id = $1`, [
          posted.documentId,
        ]),
      );
      expect(error.message).toContain('POSTED_ACCOUNTING_DOCUMENT_IS_IMMUTABLE');
    });

    it('rechaza volver a DRAFT un documento POSTED', async () => {
      const error = await expectPgError(() =>
        db.query(`UPDATE accounting_document SET status = 'DRAFT' WHERE id = $1`, [
          posted.documentId,
        ]),
      );
      expect(error.message).toContain('POSTED_ACCOUNTING_DOCUMENT_IS_IMMUTABLE');
    });

    it('rechaza alterar el hash de un asiento POSTED', async () => {
      const error = await expectPgError(() =>
        db.query(`UPDATE journal_entry SET hash_sha256 = $2 WHERE id = $1`, [
          posted.journalId,
          'b'.repeat(64),
        ]),
      );
      expect(error.message).toContain('POSTED_JOURNAL_ENTRY_IS_IMMUTABLE');
    });

    it('rechaza cambiar importes de líneas de un asiento POSTED', async () => {
      const error = await expectPgError(() =>
        db.query(
          `UPDATE journal_entry_line SET debit = 60, credit = 0 WHERE journal_entry_id = $1 AND line_no = 1`,
          [posted.journalId],
        ),
      );
      expect(error.message).toContain('POSTED_JOURNAL_LINES_ARE_IMMUTABLE');
    });

    it('rechaza borrar líneas de un asiento POSTED', async () => {
      const error = await expectPgError(() =>
        db.query(`DELETE FROM journal_entry_line WHERE journal_entry_id = $1`, [posted.journalId]),
      );
      expect(error.message).toContain('POSTED_JOURNAL_LINES_ARE_IMMUTABLE');
    });

    it('rechaza modificar o borrar la bitácora de auditoría del documento', async () => {
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO document_audit_log (accounting_document_id, event_type) VALUES ($1, 'CI_TEST') RETURNING id`,
        [posted.documentId],
      );
      const id = inserted.rows[0]!.id;
      const update = await expectPgError(() =>
        db.query(`UPDATE document_audit_log SET event_type = 'X' WHERE id = $1`, [id]),
      );
      expect(update.message).toContain('DOCUMENT_AUDIT_LOG_IS_IMMUTABLE');
      const del = await expectPgError(() =>
        db.query(`DELETE FROM document_audit_log WHERE id = $1`, [id]),
      );
      expect(del.message).toContain('DOCUMENT_AUDIT_LOG_IS_IMMUTABLE');
    });

    it('permite la única transición válida: POSTED -> REVERSED enlazando el reverso', async () => {
      const original = await insertJournal({
        status: 'POSTED',
        lines: [
          { debit: '7.00', credit: '0' },
          { debit: '0', credit: '7.00' },
        ],
      });
      const reversal = await insertJournal({
        status: 'POSTED',
        reversalOfId: original.documentId,
        lines: [
          { debit: '7.00', credit: '0' },
          { debit: '0', credit: '7.00' },
        ],
      });
      await db.query(
        `UPDATE accounting_document SET status = 'REVERSED', reversed_by_id = $2 WHERE id = $1`,
        [original.documentId, reversal.documentId],
      );
      const row = await db.query<{ status: string }>(
        'SELECT status FROM accounting_document WHERE id = $1',
        [original.documentId],
      );
      expect(row.rows[0]!.status).toBe('REVERSED');
    });
  });

  describe('período cerrado y contexto', () => {
    it('rechaza contabilizar en un período cerrado (ACCOUNTING_PERIOD_CLOSED)', async () => {
      const error = await expectPgError(() =>
        insertJournal({
          periodId: fx.closedPeriodId,
          postingDate: CLOSED_DAY,
          lines: [
            { debit: '1.00', credit: '0' },
            { debit: '0', credit: '1.00' },
          ],
        }),
      );
      expect(error.message).toContain('ACCOUNTING_PERIOD_CLOSED');
    });

    it('rechaza una fecha de contabilización fuera del período (POSTING_DATE_OUTSIDE_PERIOD)', async () => {
      const error = await expectPgError(() =>
        insertJournal({
          postingDate: '2026-03-01',
          lines: [
            { debit: '1.00', credit: '0' },
            { debit: '0', credit: '1.00' },
          ],
        }),
      );
      expect(error.message).toContain('POSTING_DATE_OUTSIDE_PERIOD');
    });
  });

  describe('duplicación de origen', () => {
    it('rechaza dos documentos con la misma clave de origen en el mismo libro', async () => {
      const sourceId = next('DUP');
      await insertJournal({
        sourceId,
        lines: [
          { debit: '3.00', credit: '0' },
          { debit: '0', credit: '3.00' },
        ],
      });
      const error = await expectPgError(() =>
        insertJournal({
          sourceId,
          lines: [
            { debit: '3.00', credit: '0' },
            { debit: '0', credit: '3.00' },
          ],
        }),
      );
      expect(error.code).toBe('23505');
      expect(error.message).toMatch(/source_system|source_type|source_id/);
    });

    it('rechaza el mismo evento facturable externo dos veces para un contrato', async () => {
      const externalRef = next('EXT');
      const insert = () =>
        db.query(
          `INSERT INTO billing_event (contract_id, event_type, event_time, base_amount, external_ref)
           VALUES ($1, 'MDR', now(), 10, $2)`,
          [fx.contractId, externalRef],
        );
      await insert();
      const error = await expectPgError(insert);
      expect(error.code).toBe('23505');
      expect(error.constraint).toBe('uq_billing_event_contract_external_ref');
    });
  });

  describe('concurrencia de reversos y recibos', () => {
    it('rechaza un segundo reverso activo del mismo documento', async () => {
      const original = await insertJournal({
        status: 'POSTED',
        lines: [
          { debit: '9.00', credit: '0' },
          { debit: '0', credit: '9.00' },
        ],
      });
      await insertJournal({
        reversalOfId: original.documentId,
        lines: [
          { debit: '9.00', credit: '0' },
          { debit: '0', credit: '9.00' },
        ],
      });
      const error = await expectPgError(() =>
        insertJournal({
          reversalOfId: original.documentId,
          lines: [
            { debit: '9.00', credit: '0' },
            { debit: '0', credit: '9.00' },
          ],
        }),
      );
      expect(error.code).toBe('23505');
      expect(error.constraint).toBe('uq_accounting_document_single_reversal');
    });

    it('dos recibos concurrentes no aplican más que el saldo de la factura', async () => {
      const invoice = await db.query<{ id: string }>(
        `INSERT INTO ar_invoice (legal_entity_id, customer_bp_id, invoice_no, invoice_date, due_date,
                                 net_amount, tax_amount, gross_amount, status)
         VALUES ($1, $2, $3, $4, $4, 100, 0, 100, 'ISSUED') RETURNING id`,
        [fx.legalEntityId, fx.customerId, next('INV'), OPEN_DAY],
      );
      const invoiceId = invoice.rows[0]!.id;
      const receipts: string[] = [];
      for (let i = 0; i < 2; i += 1) {
        const receipt = await db.query<{ id: string }>(
          `INSERT INTO receipt (legal_entity_id, payer_bp_id, receipt_no, receipt_date, amount)
           VALUES ($1, $2, $3, $4, 60) RETURNING id`,
          [fx.legalEntityId, fx.customerId, next('RC'), OPEN_DAY],
        );
        receipts.push(receipt.rows[0]!.id);
      }

      // Dos conexiones: la primera aplica 60 y mantiene la transacción abierta; la segunda intenta
      // aplicar otros 60 mientras tanto y queda bloqueada por el FOR UPDATE del trigger.
      const a = await connect(url);
      const b = await connect(url);
      try {
        await a.query('SET search_path TO atlas_accounting, public');
        await b.query('SET search_path TO atlas_accounting, public');
        await a.query('BEGIN');
        await b.query('BEGIN');
        await a.query(
          'INSERT INTO receipt_allocation (receipt_id, ar_invoice_id, allocated_amount) VALUES ($1, $2, 60)',
          [receipts[0], invoiceId],
        );
        const second = b
          .query(
            'INSERT INTO receipt_allocation (receipt_id, ar_invoice_id, allocated_amount) VALUES ($1, $2, 60)',
            [receipts[1], invoiceId],
          )
          .then(
            () => ({ ok: true as const }),
            (error: Error) => ({ ok: false as const, message: error.message }),
          );
        await new Promise((resolve) => setTimeout(resolve, 200));
        await a.query('COMMIT');
        const outcome = await second;
        await b.query('ROLLBACK');
        expect(outcome).toEqual({
          ok: false,
          message: expect.stringContaining('AR_INVOICE_ALLOCATION_EXCEEDS_OPEN_BALANCE'),
        });
      } finally {
        await a.end();
        await b.end();
      }

      const total = await db.query<{ total: string }>(
        'SELECT COALESCE(SUM(allocated_amount), 0)::text AS total FROM receipt_allocation WHERE ar_invoice_id = $1',
        [invoiceId],
      );
      expect(total.rows[0]!.total).toBe('60.00');
    });
  });
});

async function createFixture(db: Client, suffix: string): Promise<Fixture> {
  const one = async (sql: string, params: unknown[]): Promise<string> => {
    const result = await db.query<{ id: string }>(sql, params);
    return result.rows[0]!.id;
  };
  const code = `CI${suffix}`.slice(0, 20);
  const legalEntityId = await one(
    `INSERT INTO legal_entity (code, legal_name) VALUES ($1, 'Entidad CI invariantes') RETURNING id`,
    [code],
  );
  const fiscalYear2026 = await one(
    `INSERT INTO fiscal_year (legal_entity_id, year_label, start_date, end_date)
     VALUES ($1, '2026', '2026-01-01', '2026-12-31') RETURNING id`,
    [legalEntityId],
  );
  const fiscalYear2025 = await one(
    `INSERT INTO fiscal_year (legal_entity_id, year_label, start_date, end_date)
     VALUES ($1, '2025', '2025-01-01', '2025-12-31') RETURNING id`,
    [legalEntityId],
  );
  const openPeriodId = await one(
    `INSERT INTO accounting_period (fiscal_year_id, period_no, start_date, end_date)
     VALUES ($1, 1, '2026-01-01', '2026-01-31') RETURNING id`,
    [fiscalYear2026],
  );
  const closedPeriodId = await one(
    `INSERT INTO accounting_period (fiscal_year_id, period_no, start_date, end_date, is_open, close_status)
     VALUES ($1, 12, '2025-12-01', '2025-12-31', false, 'CLOSED') RETURNING id`,
    [fiscalYear2025],
  );
  const ledgerId = await one(
    `INSERT INTO ledger (legal_entity_id, code, name, accounting_basis, is_default)
     VALUES ($1, 'L0', 'Libro CI', 'LOCAL_BO', true) RETURNING id`,
    [legalEntityId],
  );
  const coaId = await one(
    `INSERT INTO chart_of_accounts (code, name, version_no, effective_from)
     VALUES ($1, 'Plan CI', 1, '2025-01-01') RETURNING id`,
    [code],
  );
  const cashAccountId = await one(
    `INSERT INTO gl_account (coa_id, account_no, name, account_type, normal_balance)
     VALUES ($1, '1100', 'Caja CI', 'ASSET', 'D') RETURNING id`,
    [coaId],
  );
  const revenueAccountId = await one(
    `INSERT INTO gl_account (coa_id, account_no, name, account_type, normal_balance)
     VALUES ($1, '4100', 'Ingresos CI', 'REVENUE', 'C') RETURNING id`,
    [coaId],
  );
  const customerId = await one(
    `INSERT INTO business_partner (partner_no, partner_type, legal_name)
     VALUES ($1, 'COMPANY', 'Cliente CI') RETURNING id`,
    [`BP${suffix}`.slice(0, 30)],
  );
  const contractId = await one(
    `INSERT INTO contract_header (contract_no, contract_type, legal_entity_id, counterparty_bp_id, start_date)
     VALUES ($1, 'MERCHANT', $2, $3, '2026-01-01') RETURNING id`,
    [`CT${suffix}`.slice(0, 30), legalEntityId, customerId],
  );
  return {
    legalEntityId,
    openPeriodId,
    closedPeriodId,
    ledgerId,
    cashAccountId,
    revenueAccountId,
    customerId,
    contractId,
  };
}
