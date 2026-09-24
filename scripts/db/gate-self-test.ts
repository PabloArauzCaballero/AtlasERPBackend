/**
 * Autoprueba del gate contable (P-12): demuestra que `accounting-db-invariants` se pone ROJO si
 * falta el control que dice vigilar.
 *
 * Para cada mutación copia la base migrada (`CREATE DATABASE … TEMPLATE`), le quita UN control
 * (trigger o índice único), corre la suite de invariantes contra la copia y exige que fallen
 * EXACTAMENTE las pruebas de ese control y ninguna otra. Si una mutación no rompe nada, el gate no
 * protege ese control y esta autoprueba falla. Un fallo de infraestructura (conexión, sintaxis) no
 * cuenta como «rojo esperado»: se exige el conjunto preciso de pruebas fallidas.
 *
 * Uso: DATABASE_URL=<base migrada> tsx scripts/db/gate-self-test.ts
 * La base de origen no puede tener otras conexiones abiertas (requisito de TEMPLATE).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';

interface Mutation {
  name: string;
  sql: string;
  expectedFailures: string[];
}

const SUITE = 'test/accounting-db-invariants.integration.spec.ts';

const MUTATIONS: Mutation[] = [
  {
    name: 'sin trigger de doble partida',
    sql: 'DROP TRIGGER trg_journal_balanced ON atlas_accounting.journal_entry_line',
    expectedFailures: [
      'rechaza al confirmar un asiento descuadrado (UNBALANCED_JOURNAL)',
      'rechaza descuadrar un asiento ya cuadrado borrando una línea',
    ],
  },
  {
    name: 'sin inmutabilidad de documento POSTED',
    sql: 'DROP TRIGGER trg_posted_accounting_document_immutable ON atlas_accounting.accounting_document',
    expectedFailures: [
      'rechaza modificar un documento POSTED',
      'rechaza volver a DRAFT un documento POSTED',
    ],
  },
  {
    name: 'sin control de período',
    sql: 'DROP TRIGGER trg_accounting_document_context ON atlas_accounting.accounting_document',
    expectedFailures: [
      'rechaza contabilizar en un período cerrado (ACCOUNTING_PERIOD_CLOSED)',
      'rechaza una fecha de contabilización fuera del período (POSTING_DATE_OUTSIDE_PERIOD)',
    ],
  },
  {
    name: 'sin control de saldo en recibos concurrentes',
    sql: 'DROP TRIGGER trg_receipt_allocation_open_balance ON atlas_accounting.receipt_allocation',
    expectedFailures: ['dos recibos concurrentes no aplican más que el saldo de la factura'],
  },
  {
    name: 'sin índice de reverso único',
    sql: 'DROP INDEX atlas_accounting.uq_accounting_document_single_reversal',
    expectedFailures: ['rechaza un segundo reverso activo del mismo documento'],
  },
  {
    name: 'sin inmutabilidad de asiento POSTED',
    sql: 'DROP TRIGGER trg_posted_journal_entry_immutable ON atlas_accounting.journal_entry',
    expectedFailures: ['rechaza alterar el hash de un asiento POSTED'],
  },
  {
    name: 'sin inmutabilidad de líneas POSTED',
    sql: 'DROP TRIGGER trg_posted_journal_line_immutable_update ON atlas_accounting.journal_entry_line',
    expectedFailures: [
      'rechaza cambiar importes de líneas de un asiento POSTED',
      'rechaza borrar líneas de un asiento POSTED',
    ],
  },
  {
    name: 'sin bitácora de auditoría inmutable',
    sql: 'DROP TRIGGER trg_document_audit_log_immutable ON atlas_accounting.document_audit_log',
    expectedFailures: ['rechaza modificar o borrar la bitácora de auditoría del documento'],
  },
  {
    name: 'sin idempotencia de eventos facturables',
    sql: 'DROP INDEX atlas_accounting.uq_billing_event_contract_external_ref',
    expectedFailures: ['rechaza el mismo evento facturable externo dos veces para un contrato'],
  },
  {
    name: 'sin unicidad de origen',
    sql: 'ALTER TABLE atlas_accounting.accounting_document DROP CONSTRAINT accounting_document_source_system_source_type_source_id_led_key',
    expectedFailures: ['rechaza dos documentos con la misma clave de origen en el mismo libro'],
  },
];

async function main(): Promise<void> {
  const sourceUrl = process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error('DATABASE_URL (base migrada) es obligatorio.');
  const source = new URL(sourceUrl);
  const sourceDb = source.pathname.slice(1);
  const admin = new URL(sourceUrl);
  admin.pathname = '/postgres';
  const outDir = mkdtempSync(join(tmpdir(), 'gate-self-test-'));
  let failed = false;

  for (const [index, mutation] of MUTATIONS.entries()) {
    const copy = `gate_selftest_${index}`;
    const adminClient = new Client({ connectionString: admin.toString() });
    await adminClient.connect();
    await adminClient.query(`DROP DATABASE IF EXISTS ${copy}`);
    await adminClient.query(`CREATE DATABASE ${copy} TEMPLATE "${sourceDb}"`);
    await adminClient.end();

    const copyUrl = new URL(sourceUrl);
    copyUrl.pathname = `/${copy}`;
    const client = new Client({ connectionString: copyUrl.toString() });
    await client.connect();
    await client.query(mutation.sql);
    await client.end();

    const output = join(outDir, `${index}.json`);
    spawnSync(
      process.execPath,
      [
        'node_modules/jest/bin/jest.js',
        '--config',
        './jest.integration.config.cjs',
        '--runInBand',
        '--forceExit',
        '--json',
        `--outputFile=${output}`,
        SUITE,
      ],
      {
        env: {
          ...process.env,
          ERP_INTEGRATION_DATABASE_URL: copyUrl.toString(),
          DATABASE_URL: copyUrl.toString(),
          ERP_INTEGRATION_REQUIRED: '1',
        },
        stdio: 'ignore',
      },
    );

    const results = JSON.parse(readFileSync(output, 'utf8')) as {
      numTotalTests: number;
      testResults: Array<{ assertionResults: Array<{ title: string; status: string }> }>;
    };
    const assertions = results.testResults.flatMap((r) => r.assertionResults);
    const failures = assertions
      .filter((a) => a.status === 'failed')
      .map((a) => a.title)
      .sort();
    const expected = [...mutation.expectedFailures].sort();
    const ok =
      assertions.length > expected.length && JSON.stringify(failures) === JSON.stringify(expected);
    process.stdout.write(
      `${ok ? '✅' : '❌'} ${mutation.name}: fallaron ${failures.length}/${assertions.length}` +
        (ok
          ? ''
          : `\n   esperadas: ${JSON.stringify(expected)}\n   obtenidas: ${JSON.stringify(failures)}`) +
        '\n',
    );
    failed = failed || !ok;

    const cleanup = new Client({ connectionString: admin.toString() });
    await cleanup.connect();
    await cleanup.query(`DROP DATABASE IF EXISTS ${copy}`);
    await cleanup.end();
  }

  if (failed) {
    process.stderr.write(
      '❌ El gate contable no detecta alguna mutación: no protege ese control.\n',
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
