/**
 * Dos «mundos» SINTÉTICOS para las pruebas de aislamiento (P-13): entidad legal A y B con su
 * calendario, libro, dimensiones, contrato, documento contable y condición de pago; y dos comercios
 * (A y B) con su usuario, sucursal, factura y archivo. Todo inventado y aleatorio por ejecución:
 * ningún dato personal real.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { Client } from 'pg';

const tag = (): string => randomBytes(3).toString('hex').toUpperCase();

async function insert(sql: Client, text: string, values: unknown[]): Promise<string> {
  const result = await sql.query<{ id: string }>(`${text} RETURNING id`, values);
  return result.rows[0]!.id;
}

export interface LegalEntityWorld {
  legalEntityId: string;
  fiscalYearId: string;
  periodId: string;
  ledgerId: string;
  branchId: string;
  costCenterId: string;
  profitCenterId: string;
  bankAccountId: string;
  contractId: string;
  billingEventId: string;
  documentId: string;
  journalEntryId: string;
  supplierTermsId: string;
  supplierBpId: string;
}

export interface SharedAccounting {
  coaId: string;
  cashAccountId: string;
  revenueAccountId: string;
  partnerId: string;
}

export async function seedSharedAccounting(sql: Client): Promise<SharedAccounting> {
  const t = tag();
  const coaId = await insert(
    sql,
    `INSERT INTO chart_of_accounts (code, name, effective_from) VALUES ($1, 'Plan sintético', '2020-01-01')`,
    [`COA-${t}`],
  );
  const cashAccountId = await insert(
    sql,
    `INSERT INTO gl_account (coa_id, account_no, name, account_type, normal_balance)
     VALUES ($1, $2, 'Caja sintética', 'ASSET', 'D')`,
    [coaId, `11${t}`.slice(0, 20)],
  );
  const revenueAccountId = await insert(
    sql,
    `INSERT INTO gl_account (coa_id, account_no, name, account_type, normal_balance)
     VALUES ($1, $2, 'Ingreso sintético', 'REVENUE', 'C')`,
    [coaId, `41${t}`.slice(0, 20)],
  );
  const partnerId = await insert(
    sql,
    `INSERT INTO business_partner (partner_no, partner_type, legal_name) VALUES ($1, 'COMPANY', $2)`,
    [`BP-${t}`, `Contraparte Sintética ${t}`],
  );
  return { coaId, cashAccountId, revenueAccountId, partnerId };
}

export async function seedLegalEntityWorld(
  sql: Client,
  shared: SharedAccounting,
  label: string,
): Promise<LegalEntityWorld> {
  const t = tag();
  const year = new Date().getUTCFullYear();
  const legalEntityId = await insert(
    sql,
    `INSERT INTO legal_entity (code, legal_name) VALUES ($1, $2)`,
    [`LE${label}${t}`.slice(0, 20), `Entidad ${label} Sintética`],
  );
  const fiscalYearId = await insert(
    sql,
    `INSERT INTO fiscal_year (legal_entity_id, year_label, start_date, end_date) VALUES ($1, $2, $3, $4)`,
    [legalEntityId, String(year), `${year}-01-01`, `${year}-12-31`],
  );
  const periodId = await insert(
    sql,
    `INSERT INTO accounting_period (fiscal_year_id, period_no, start_date, end_date) VALUES ($1, 1, $2, $3)`,
    [fiscalYearId, `${year}-01-01`, `${year}-12-31`],
  );
  const ledgerId = await insert(
    sql,
    `INSERT INTO ledger (legal_entity_id, code, name, accounting_basis, is_default)
     VALUES ($1, 'LOCAL', 'Libro local', 'LOCAL_BO', true)`,
    [legalEntityId],
  );
  const branchId = await insert(
    sql,
    `INSERT INTO branch (legal_entity_id, code, name) VALUES ($1, 'MAT', 'Casa matriz')`,
    [legalEntityId],
  );
  const costCenterId = await insert(
    sql,
    `INSERT INTO cost_center (legal_entity_id, code, name) VALUES ($1, 'CC1', 'Centro de costo')`,
    [legalEntityId],
  );
  const profitCenterId = await insert(
    sql,
    `INSERT INTO profit_center (legal_entity_id, code, name) VALUES ($1, 'PC1', 'Centro de beneficio')`,
    [legalEntityId],
  );
  const bankAccountId = await insert(
    sql,
    `INSERT INTO bank_account (legal_entity_id, account_name, account_no_hash) VALUES ($1, $2, $3)`,
    [legalEntityId, `Cuenta ${label}`, randomBytes(16).toString('hex')],
  );
  const contractId = await insert(
    sql,
    `INSERT INTO contract_header (contract_no, contract_type, legal_entity_id, counterparty_bp_id, start_date, status)
     VALUES ($1, 'CORPORATE', $2, $3, $4, 'ACTIVE')`,
    [`CT-${label}-${t}`, legalEntityId, shared.partnerId, `${year}-01-01`],
  );
  const billingEventId = await insert(
    sql,
    `INSERT INTO billing_event (contract_id, event_type, event_time, base_amount) VALUES ($1, 'USAGE', now(), 10)`,
    [contractId],
  );
  const today = new Date().toISOString().slice(0, 10);
  const documentId = await insert(
    sql,
    `INSERT INTO accounting_document (legal_entity_id, source_system, source_type, source_id, document_type,
       document_no, document_date, posting_date, accounting_period_id, ledger_id)
     VALUES ($1, 'P13', 'SYNTHETIC', $2, 'JOURNAL', $3, $4, $4, $5, $6)`,
    [legalEntityId, randomUUID(), `DOC-${label}-${t}`, today, periodId, ledgerId],
  );
  const journalEntryId = await insert(
    sql,
    `INSERT INTO journal_entry (accounting_document_id, journal_no) VALUES ($1, $2)`,
    [documentId, `JRN-${label}-${t}`],
  );
  await sql.query(
    `INSERT INTO journal_entry_line (journal_entry_id, line_no, gl_account_id, debit, credit, amount_lc)
     VALUES ($1, 1, $2, 10, 0, 10), ($1, 2, $3, 0, 10, 10)`,
    [journalEntryId, shared.cashAccountId, shared.revenueAccountId],
  );
  const supplierTermsId = await insert(
    sql,
    `INSERT INTO supplier_payment_terms (legal_entity_id, supplier_bp_id, code, name, currency_code, modality,
       term_days, payment_method, valid_from)
     VALUES ($1, $2, $3, 'Crédito 30 días', 'BOB', 'CREDITO', 30, 'CHEQUE', $4)`,
    [legalEntityId, shared.partnerId, `TERM-${t}`, `${year}-01-01`],
  );
  return {
    legalEntityId,
    fiscalYearId,
    periodId,
    ledgerId,
    branchId,
    costCenterId,
    profitCenterId,
    bankAccountId,
    contractId,
    billingEventId,
    documentId,
    journalEntryId,
    supplierTermsId,
    supplierBpId: shared.partnerId,
  };
}

export interface MerchantWorld {
  accountId: string;
  userId: string;
  email: string;
  branchId: string;
  fileId: string;
}

/**
 * Un comercio con su usuario del portal (membresía ACTIVE atada al `sub` del token), una sucursal
 * y un documento KYB registrado en `erp_file`.
 */
export async function seedMerchantWorld(
  sql: Client,
  label: string,
  membershipStatus: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE',
): Promise<MerchantWorld> {
  const t = tag();
  const accountId = await insert(
    sql,
    `INSERT INTO atlas_sales.b2b_accounts (legal_name, trade_name, category, business_line, lifecycle_status)
     VALUES ($1, $2, 'RETAIL', 'COMERCIO', 'CUSTOMER')`,
    [`Comercio ${label} ${t} SRL`, `Comercio ${label}`],
  );
  const userId = randomUUID();
  const email = `comercio.${label.toLowerCase()}.${t.toLowerCase()}@atlas.test`;
  await sql.query(
    `INSERT INTO atlas_sales.merchant_users (account_id, email, full_name, role_code, status, user_id)
     VALUES ($1, $2, $3, 'MERCHANT_ADMIN', $4, $5)`,
    [accountId, email, `Usuario ${label}`, membershipStatus, userId],
  );
  const branchId = await insert(
    sql,
    `INSERT INTO atlas_sales.merchant_branches (account_id, name, city, status)
     VALUES ($1, $2, 'Santa Cruz', 'ACTIVE')`,
    [accountId, `Sucursal ${label}`],
  );
  const fileId = await insert(
    sql,
    `INSERT INTO atlas_accounting.erp_file (owner_type, owner_id, file_name, mime_type, byte_size,
       storage_provider, storage_public_id, secure_url, sha256)
     VALUES ('B2B_ACCOUNT', $1, $2, 'application/pdf', 10, 'ATLAS_MINIO', $3, $4, $5)`,
    [
      accountId,
      `kyb-${label}.pdf`,
      `erp-b2b/${accountId}/kyb.pdf`,
      `atlas-minio://erp-b2b/${accountId}/kyb.pdf`,
      'a'.repeat(64),
    ],
  );
  return { accountId, userId, email, branchId, fileId };
}
