/**
 * Escenario de carga de las rutas financieras nuevas (P-16): cobertura → liquidación con doble
 * control → recuperación → puente factura→mayor, contra la API COMPILADA y un PostgreSQL migrado.
 *
 * Cada iteración de un trabajador recorre un ciclo completo por HTTP, como lo haría la consola:
 *
 *   1. POST  /b2b/coverage/payables                      (y, a la vez, un DUPLICADO de la misma cuota)
 *   2. PATCH /b2b/coverage/payables/:id/paid             (persona A, con evidencia)
 *   3. PATCH /b2b/coverage/payables/:id/settlement/approve (persona B: nace la CxC de recuperación)
 *   4. PATCH /b2b/coverage/recoveries/:id/apply-payment  100,00 + 200,00 y REPETICIÓN del primero
 *   5. PATCH /b2b/billing/invoices/:id/post-to-gl        dos llamadas simultáneas sobre la misma factura
 *   6. PATCH /accounting/documents/:id/post              el borrador del puente, contabilizado por otra persona
 *
 * Los datos de partida (comercio, contrato, compra y cuota vencida; entidad contable, período,
 * cuentas y factura) se insertan por SQL antes del paso medido, como hacen las pruebas de
 * integración (`test/support/coverage-fixtures.ts`, `test/merchant-accounting-bridge.integration.spec.ts`):
 * no hay ruta HTTP que cree una compra BNPL y la carga debe medir las rutas financieras, no el alta.
 * Todo es SINTÉTICO: nombres, NIT y referencias aleatorios; ningún dato personal.
 *
 * Al terminar corre las consultas de CONCILIACIÓN que deben dar cero: CxP vivas duplicadas por cuota,
 * CxC de recuperación duplicadas por CxP, cobros duplicados por referencia, saldo recuperado distinto
 * de la suma de movimientos, documentos contables duplicados por factura y asientos descuadrados.
 *
 * Uso:
 *   DATABASE_URL=… JWT_ACCESS_SECRET=… CORS_ALLOWED_ORIGINS=… \
 *     yarn perf:financial --base-url http://127.0.0.1:3007/api/v1 --concurrency 8 --duration 120 \
 *     --pid <pid de la API> --out resultado.json
 *
 * No es un SLO: los números describen la máquina y la configuración en que se midieron.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { sign } from 'jsonwebtoken';
import { Pool } from 'pg';

type Step = 'schedule' | 'settle' | 'approve' | 'recover' | 'recoverReplay' | 'bridge' | 'post';

interface Sample {
  step: Step;
  t: number;
  ms: number;
  status: number;
}

const argv = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i] ?? '';
  if (!key.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) argv.set(key.slice(2), 'true');
  else {
    argv.set(key.slice(2), next);
    i += 1;
  }
}
const opt = (name: string, fallback: string): string => argv.get(name) ?? fallback;

const BASE_URL = opt('base-url', 'http://127.0.0.1:3007/api/v1');
const CONCURRENCY = Number(opt('concurrency', '4'));
const DURATION_S = Number(opt('duration', '30'));
const LABEL = opt('label', 'financiera');
const PID = opt('pid', '');
const OUT = opt('out', '');
/**
 * Mezcla para el ensayo de restore (por omisión apagada, así la carga mide ciclos completos):
 * cada N ciclos la CxP queda SIN liquidar (`--open-every`) o la recuperación queda PARCIAL, sólo el
 * cobro de 100,00 (`--partial-every`). Da saldos abiertos de CxP y CxC que conciliar.
 */
const OPEN_EVERY = Number(opt('open-every', '0'));
const PARTIAL_EVERY = Number(opt('partial-every', '0'));
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const SECRET = process.env.JWT_ACCESS_SECRET ?? '';
const ISSUER = process.env.JWT_ACCESS_ISSUER ?? 'atlas-erp';
const AUDIENCE = process.env.JWT_ACCESS_AUDIENCE ?? 'atlas-erp-api';

if (!DATABASE_URL || !SECRET) {
  console.error('Faltan DATABASE_URL (base migrada) y JWT_ACCESS_SECRET (el de la API medida).');
  process.exit(2);
}
if (process.env.NODE_ENV === 'production') {
  console.error('financial-load firma tokens de usuarios inventados: nunca en producción.');
  process.exit(2);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: CONCURRENCY + 2 });
// Una caída de Postgres a mitad de la carga (escenario `postgres-outage`) cierra las conexiones
// ociosas del pool; sin este manejador el evento `error` tumbaba el propio generador.
let seedErrors = 0;
pool.on('error', () => {
  seedErrors += 1;
});

/** Dos personas distintas: la liquidación exige que confirme alguien que no la registró. */
function token(sub: string): string {
  const roles = ['FINANCE', 'ADMIN', 'ACCOUNTANT', 'COLLECTIONS', 'OPERATIONS'];
  return sign(
    { sub, email: `${sub.slice(0, 8)}@bench.invalid`, roles, roleCode: roles[0] },
    SECRET,
    {
      expiresIn: '2h',
      issuer: ISSUER,
      audience: AUDIENCE,
    },
  );
}
const REGISTRAR = token(randomUUID());
const APPROVER = token(randomUUID());

const RUN = `${LABEL}-${Date.now().toString(36)}`;
const businessDate = (offsetDays: number): string => {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
};

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await pool.query(sql, params);
  return result.rows[0] as T;
}

/** Comercio, contrato ACTIVO, compra confirmada y una cuota de 300,00 vencida hace 5 días. */
async function seedInstallment(): Promise<{ installmentId: string; accountId: string }> {
  const tag = randomUUID().slice(0, 8);
  const { id: accountId } = await one<{ id: string }>(
    `INSERT INTO atlas_sales.b2b_accounts (legal_name, trade_name, tax_id, lifecycle_status, category, business_line)
     VALUES ($1, $1, $2, 'CUSTOMER', 'PRUEBA', 'PRUEBA') RETURNING id`,
    [`Comercio sintético ${tag}`, `NIT-BENCH-${tag}`],
  );
  const { id: contractId } = await one<{ id: string }>(
    `INSERT INTO atlas_sales.b2b_contracts (account_id, contract_number, status, start_date)
     VALUES ($1, $2, 'ACTIVE', '2026-01-01') RETURNING id`,
    [accountId, `CT-BENCH-${tag}`],
  );
  const { id: versionId } = await one<{ id: string }>(
    `INSERT INTO atlas_sales.contract_versions (contract_id, version_number, valid_from, status)
     VALUES ($1, 1, '2026-01-01', 'ACTIVE') RETURNING id`,
    [contractId],
  );
  const consumerId = randomUUID();
  await pool.query('INSERT INTO atlas_sales.consumers_ref (id, external_ref) VALUES ($1, $2)', [
    consumerId,
    `consumidor-sintetico-${tag}`,
  ]);
  const { id: purchaseId } = await one<{ id: string }>(
    `INSERT INTO atlas_sales.bnpl_purchases
       (merchant_account_id, consumer_id, contract_version_id, purchase_amount, down_payment_amount, financed_amount, status)
     VALUES ($1, $2, $3, '300.00', 0, '300.00', 'CONFIRMED') RETURNING id`,
    [accountId, consumerId, versionId],
  );
  const { id: installmentId } = await one<{ id: string }>(
    `INSERT INTO atlas_sales.bnpl_installments (purchase_id, installment_number, due_date, amount, status)
     VALUES ($1, 1, $2, '300.00', 'SCHEDULED') RETURNING id`,
    [purchaseId, businessDate(-5)],
  );
  return { installmentId, accountId };
}

async function addEvidence(payableId: string): Promise<string> {
  const { id } = await one<{ id: string }>(
    `INSERT INTO atlas_accounting.erp_file (owner_type, owner_id, file_name, storage_public_id, secure_url, status)
     VALUES ('MERCHANT_PAYABLE', $1, 'comprobante-sintetico.pdf', $2, 'https://example.invalid/sintetico', 'ACTIVE')
     RETURNING id`,
    [payableId, `sintetico/${randomUUID()}`],
  );
  return id;
}

interface Books {
  legalEntityId: string;
  periodId: string;
  ledgerId: string;
  arAccountId: string;
  revenueAccountId: string;
  taxAccountId: string;
  accountId: string;
}

/** Un mundo contable propio por trabajador: entidad, año, período abierto del mes, libro y cuentas. */
async function seedBooks(): Promise<Books> {
  const s = randomUUID().slice(0, 8).toUpperCase();
  const today = businessDate(0);
  const year = today.slice(0, 4);
  const month = Number(today.slice(5, 7));
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = new Date(Date.UTC(Number(year), month, 0)).toISOString().slice(0, 10);
  const { id: legalEntityId } = await one<{ id: string }>(
    `INSERT INTO atlas_accounting.legal_entity (code, legal_name, base_currency)
     VALUES ($1, 'Entidad sintética', 'BOB') RETURNING id`,
    [`BN${s}`],
  );
  const { id: fy } = await one<{ id: string }>(
    `INSERT INTO atlas_accounting.fiscal_year (legal_entity_id, year_label, start_date, end_date)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [legalEntityId, year, `${year}-01-01`, `${year}-12-31`],
  );
  const { id: periodId } = await one<{ id: string }>(
    `INSERT INTO atlas_accounting.accounting_period (fiscal_year_id, period_no, start_date, end_date)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [fy, month, monthStart, monthEnd],
  );
  const { id: ledgerId } = await one<{ id: string }>(
    `INSERT INTO atlas_accounting.ledger (legal_entity_id, code, name, accounting_basis, is_default)
     VALUES ($1, 'LOCAL', 'Local', 'LOCAL_BO', true) RETURNING id`,
    [legalEntityId],
  );
  const { id: coa } = await one<{ id: string }>(
    `INSERT INTO atlas_accounting.chart_of_accounts (code, name, effective_from)
     VALUES ($1, 'Plan sintético', '2026-01-01') RETURNING id`,
    [`BC${s}`],
  );
  const account = async (no: string, name: string, type: string, normal: string) =>
    (
      await one<{ id: string }>(
        `INSERT INTO atlas_accounting.gl_account (coa_id, account_no, name, account_type, normal_balance)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [coa, no, name, type, normal],
      )
    ).id;
  const arAccountId = await account('1130', 'CxC comercios', 'ASSET', 'D');
  const revenueAccountId = await account('4110', 'Ingreso MDR', 'REVENUE', 'C');
  const taxAccountId = await account('2140', 'IVA débito', 'LIABILITY', 'C');
  const { id: partnerId } = await one<{ id: string }>(
    `INSERT INTO atlas_accounting.business_partner (partner_no, partner_type, legal_name)
     VALUES ($1, 'COMPANY', 'Comercio sintético') RETURNING id`,
    [`BP${s}`],
  );
  const { id: accountId } = await one<{ id: string }>(
    `INSERT INTO atlas_sales.b2b_accounts (legal_name, trade_name, category, business_line, business_partner_id)
     VALUES ($1, $1, 'RETAIL', 'Electro', $2) RETURNING id`,
    [`Comercio contable ${s}`, partnerId],
  );
  return {
    legalEntityId,
    periodId,
    ledgerId,
    arAccountId,
    revenueAccountId,
    taxAccountId,
    accountId,
  };
}

async function seedInvoice(books: Books): Promise<string> {
  const s = randomUUID().slice(0, 10).toUpperCase();
  const { id } = await one<{ id: string }>(
    `INSERT INTO atlas_sales.merchant_invoices
       (account_id, invoice_number, invoice_date, due_date, subtotal_amount, tax_amount, total_amount, status)
     VALUES ($1, $2, $3, $4, '100.00', '13.00', '113.00', 'ISSUED') RETURNING id`,
    [books.accountId, `FAC-BENCH-${s}`, businessDate(0), businessDate(30)],
  );
  await pool.query(
    `INSERT INTO atlas_sales.merchant_receivables (account_id, invoice_id, source_type, amount_original, amount_open, currency, due_date)
     VALUES ($1, $2, 'MDR', '100.00', '100.00', 'BOB', $3)`,
    [books.accountId, id, businessDate(30)],
  );
  await pool.query(
    `INSERT INTO atlas_sales.merchant_invoice_lines (invoice_id, source_type, description, unit_amount, tax_amount, total_amount)
     VALUES ($1, 'MDR', 'Comisión MDR', '100.00', '13.00', '113.00')`,
    [id],
  );
  return id;
}

const samples: Sample[] = [];
/** Resultado de cada pareja simultánea: la cobertura duplicada y el puente llamado dos veces. */
const pairs: { schedule: Record<string, number>; bridge: Record<string, number> } = {
  schedule: {},
  bridge: {},
};
const unexpected: Array<{ step: Step; status: number; body: string }> = [];
let startedAt = 0;

async function call(
  step: Step,
  method: 'POST' | 'PATCH',
  path: string,
  body: unknown,
  bearer: string,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const t0 = performance.now();
  let status = 0;
  let json: Record<string, unknown> | null = null;
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    status = response.status;
    const text = await response.text();
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = null;
    }
    if (status >= 500 || (status >= 400 && step !== 'schedule' && step !== 'recoverReplay')) {
      if (unexpected.length < 20) unexpected.push({ step, status, body: text.slice(0, 300) });
    }
  } catch (error) {
    if (unexpected.length < 20)
      unexpected.push({ step, status: 0, body: String(error).slice(0, 300) });
  }
  samples.push({
    step,
    t: (performance.now() - startedAt) / 1000,
    ms: performance.now() - t0,
    status,
  });
  return { status, json };
}

/** La API envuelve en `{ success, data }`; se acepta también la respuesta desnuda. */
function data(json: Record<string, unknown> | null): Record<string, unknown> {
  if (json && typeof json.data === 'object' && json.data !== null)
    return json.data as Record<string, unknown>;
  return json ?? {};
}

async function cycle(books: Books, n: number): Promise<void> {
  const { installmentId, accountId } = await seedInstallment();
  const scheduleBody = {
    installmentId,
    scheduledPaymentDate: businessDate(0),
    reason: 'CUSTOMER_INSTALLMENT_DEFAULT_COVERAGE',
  };
  // La misma cuota dos veces A LA VEZ: una CxP, la otra 409.
  const [first, second] = await Promise.all([
    call('schedule', 'POST', '/b2b/coverage/payables', scheduleBody, REGISTRAR),
    call('schedule', 'POST', '/b2b/coverage/payables', scheduleBody, REGISTRAR),
  ]);
  const pair = [first.status, second.status].sort().join('+');
  pairs.schedule[pair] = (pairs.schedule[pair] ?? 0) + 1;
  const created = [first, second].find((r) => r.status === 201);
  const payableId = created ? (data(created.json).id as string | undefined) : undefined;
  if (!payableId) return;

  const evidenceFileId = await addEvidence(payableId);
  const leaveOpen = OPEN_EVERY > 0 && Math.abs(n) % OPEN_EVERY === 0;
  const partial = PARTIAL_EVERY > 0 && Math.abs(n) % PARTIAL_EVERY === 1;
  if (leaveOpen) {
    await bridgeAndPost(books);
    return;
  }
  await call(
    'settle',
    'PATCH',
    `/b2b/coverage/payables/${payableId}/paid`,
    {
      settlementReference: `LIQ-${RUN}-${n}`,
      amount: '300.00',
      currency: 'BOB',
      beneficiaryAccountId: accountId,
      paidAt: new Date(Date.now() - 60_000).toISOString(),
      evidenceFileId,
    },
    REGISTRAR,
  );
  const approved = await call(
    'approve',
    'PATCH',
    `/b2b/coverage/payables/${payableId}/settlement/approve`,
    { note: 'confirmada por segunda persona' },
    APPROVER,
  );
  const recovery = data(approved.json).recovery as { id?: string } | null | undefined;
  if (recovery?.id) {
    const path = `/b2b/coverage/recoveries/${recovery.id}/apply-payment`;
    const firstPayment = {
      amount: '100.00',
      paymentReference: `REC-${RUN}-${n}-1`,
      currency: 'BOB',
    };
    await call('recover', 'PATCH', path, firstPayment, REGISTRAR);
    if (!partial)
      await call(
        'recover',
        'PATCH',
        path,
        { amount: '200.00', paymentReference: `REC-${RUN}-${n}-2`, currency: 'BOB' },
        REGISTRAR,
      );
    // Repetición del primer cobro: no debe volver a sumar.
    await call('recoverReplay', 'PATCH', path, firstPayment, REGISTRAR);
  }

  await bridgeAndPost(books);
}

/** Puente factura→mayor (dos llamadas simultáneas) y contabilización por otra persona. */
async function bridgeAndPost(books: Books): Promise<void> {
  const invoiceId = await seedInvoice(books);
  const bridgeBody = {
    legalEntityId: books.legalEntityId,
    accountingPeriodId: books.periodId,
    ledgerId: books.ledgerId,
    arAccountId: books.arAccountId,
    revenueAccountId: books.revenueAccountId,
    taxAccountId: books.taxAccountId,
    currencyCode: 'BOB',
  };
  const bridged = await Promise.all([
    call('bridge', 'PATCH', `/b2b/billing/invoices/${invoiceId}/post-to-gl`, bridgeBody, REGISTRAR),
    call('bridge', 'PATCH', `/b2b/billing/invoices/${invoiceId}/post-to-gl`, bridgeBody, APPROVER),
  ]);
  const documentIds = new Set(bridged.map((r) => String(data(r.json).accountingDocumentId ?? '')));
  const bridgeKey =
    bridged.every((r) => r.status === 200) && documentIds.size === 1 && !documentIds.has('')
      ? 'same-document'
      : `other:${bridged.map((r) => r.status).join('+')}`;
  pairs.bridge[bridgeKey] = (pairs.bridge[bridgeKey] ?? 0) + 1;
  // El borrador que dejó el puente se CONTABILIZA (otra persona): así la carga también escribe
  // asientos POSTED y la conciliación de debe = haber mide algo más que borradores.
  const documentId = [...documentIds][0];
  if (bridgeKey === 'same-document' && documentId) {
    await call('post', 'PATCH', `/accounting/documents/${documentId}/post`, {}, APPROVER);
  }
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number((sorted[index] ?? 0).toFixed(2));
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.length ? Number((sorted[sorted.length - 1] ?? 0).toFixed(2)) : null,
  };
}

function rssMb(): number | null {
  if (!PID) return null;
  try {
    const out = execFileSync('ps', ['-o', 'rss=', '-p', PID], { encoding: 'utf8' }).trim();
    return Number((Number(out) / 1024).toFixed(1));
  } catch {
    return null;
  }
}

/** Conciliación sobre las filas de ESTA corrida: cada consulta debe dar 0. */
async function reconcile(): Promise<Record<string, number>> {
  const q = async (sql: string) => Number((await one<{ n: string }>(sql)).n);
  return {
    livePayablesDuplicatedPerInstallment: await q(
      `SELECT count(*)::text AS n FROM (SELECT installment_id FROM atlas_sales.merchant_payables
        WHERE status <> 'CANCELLED' GROUP BY installment_id HAVING count(*) > 1) d`,
    ),
    recoveriesDuplicatedPerPayable: await q(
      `SELECT count(*)::text AS n FROM (SELECT merchant_payable_id FROM atlas_sales.consumer_recovery_receivables
        GROUP BY merchant_payable_id HAVING count(*) > 1) d`,
    ),
    recoveryMovementsDuplicatedPerReference: await q(
      `SELECT count(*)::text AS n FROM (SELECT payment_reference FROM atlas_sales.consumer_recovery_movements
        GROUP BY payment_reference HAVING count(*) > 1) d`,
    ),
    recoveredDiffersFromMovements: await q(
      `SELECT count(*)::text AS n FROM atlas_sales.consumer_recovery_receivables r
        WHERE r.amount_recovered <> COALESCE((SELECT sum(CASE WHEN m.movement_type = 'PAYMENT' THEN m.amount ELSE -m.amount END)
                                                FROM atlas_sales.consumer_recovery_movements m WHERE m.recovery_id = r.id), 0)`,
    ),
    settlementsDuplicatedPerPayable: await q(
      `SELECT count(*)::text AS n FROM (SELECT merchant_payable_id FROM atlas_sales.merchant_payable_settlements
        WHERE status <> 'REJECTED' GROUP BY merchant_payable_id HAVING count(*) > 1) d`,
    ),
    accountingDocumentsDuplicatedPerInvoice: await q(
      `SELECT count(*)::text AS n FROM (SELECT source_id FROM atlas_accounting.accounting_document
        WHERE source_system = 'CRM' AND source_type = 'MERCHANT_INVOICE' GROUP BY source_id HAVING count(*) > 1) d`,
    ),
    unbalancedJournalEntries: await q(
      `SELECT count(*)::text AS n FROM (SELECT journal_entry_id FROM atlas_accounting.journal_entry_line
        GROUP BY journal_entry_id HAVING sum(debit) <> sum(credit)) d`,
    ),
    outboxDuplicatedEventKey: await q(
      `SELECT count(*)::text AS n FROM (SELECT event_key FROM atlas_accounting.event_outbox
        GROUP BY event_key HAVING count(*) > 1) d`,
    ),
  };
}

async function counts(): Promise<Record<string, number>> {
  const q = async (sql: string) => Number((await one<{ n: string }>(sql)).n);
  return {
    payables: await q(`SELECT count(*)::text AS n FROM atlas_sales.merchant_payables`),
    recoveries: await q(
      `SELECT count(*)::text AS n FROM atlas_sales.consumer_recovery_receivables`,
    ),
    recoveryMovements: await q(
      `SELECT count(*)::text AS n FROM atlas_sales.consumer_recovery_movements`,
    ),
    accountingDocuments: await q(
      `SELECT count(*)::text AS n FROM atlas_accounting.accounting_document`,
    ),
    outboxPending: await q(
      `SELECT count(*)::text AS n FROM atlas_accounting.event_outbox WHERE status = 'PENDING'`,
    ),
    outboxTotal: await q(`SELECT count(*)::text AS n FROM atlas_accounting.event_outbox`),
  };
}

async function main(): Promise<void> {
  const before = await counts();
  const books = await Promise.all(Array.from({ length: CONCURRENCY }, () => seedBooks()));
  // Calentamiento: un ciclo por trabajador, fuera de la medida.
  startedAt = performance.now();
  await Promise.all(books.map((b, i) => cycle(b, -1 - i)));
  samples.length = 0;
  unexpected.length = 0;
  pairs.schedule = {};
  pairs.bridge = {};

  startedAt = performance.now();
  const deadline = startedAt + DURATION_S * 1000;
  let iteration = 0;
  let cycles = 0;
  const rss: number[] = [];
  const sampler = setInterval(() => {
    const value = rssMb();
    if (value !== null) rss.push(value);
  }, 1000);
  await Promise.all(
    books.map(async (b) => {
      while (performance.now() < deadline) {
        iteration += 1;
        try {
          await cycle(b, iteration);
          cycles += 1;
        } catch {
          // La siembra por SQL falló (base caída): se cuenta y se sigue, como haría la consola.
          seedErrors += 1;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }),
  );
  clearInterval(sampler);
  const elapsed = (performance.now() - startedAt) / 1000;

  const steps: Record<string, unknown> = {};
  for (const step of [
    'schedule',
    'settle',
    'approve',
    'recover',
    'recoverReplay',
    'bridge',
    'post',
  ] as Step[]) {
    const own = samples.filter((s) => s.step === step);
    const byStatus: Record<string, number> = {};
    for (const s of own) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    steps[step] = { ...stats(own.map((s) => s.ms)), byStatus };
  }
  const technical = samples.filter((s) => s.status === 0 || s.status >= 500).length;
  // Tras una caída, la base puede tardar unos segundos en aceptar conexiones otra vez.
  for (let i = 0; i < 60; i += 1) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  const after = await counts();
  const summary = {
    label: LABEL,
    run: RUN,
    concurrency: CONCURRENCY,
    durationS: Number(elapsed.toFixed(1)),
    cycles,
    cyclesPerS: Number((cycles / elapsed).toFixed(2)),
    requests: samples.length,
    requestsPerS: Number((samples.length / elapsed).toFixed(1)),
    technicalErrors: technical,
    seedErrors,
    latencyAllMs: stats(samples.map((s) => s.ms)),
    steps,
    pairs,
    rss: rss.length ? { start: rss[0], max: Math.max(...rss), end: rss[rss.length - 1] } : null,
    rowsCreated: Object.fromEntries(
      Object.entries(after).map(([k, v]) => [k, k === 'outboxPending' ? v : v - (before[k] ?? 0)]),
    ),
    reconciliation: await reconcile(),
    unexpected,
  };
  if (OUT) writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  await pool.end();
  const failed = Object.values(summary.reconciliation).some((v) => v !== 0);
  process.exit(failed ? 1 : 0);
}

main().catch(async (error: unknown) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
