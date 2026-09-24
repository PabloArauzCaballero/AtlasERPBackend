/**
 * Módulo de Nest y datos SINTÉTICOS para las pruebas de integración de cobertura. Ningún dato
 * personal real: nombres, NIT y referencias son inventados y aleatorios por prueba.
 */
import { randomUUID } from 'node:crypto';
import { SequelizeModule } from '@nestjs/sequelize';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { getConnectionToken } from '@nestjs/sequelize';
import { PinoLoggerService } from '../../src/common/logging/pino-logger.service';
import { MessagingTraceService } from '../../src/common/observability/messaging-trace.service';
import { atlasSalesModels } from '../../src/modules/b2b-sales-crm/models/b2b-sales-crm.models';
import { B2BSalesCrmRepository } from '../../src/modules/b2b-sales-crm/repositories/b2b-sales-crm.repository';
import { B2BCoverageService } from '../../src/modules/b2b-sales-crm/services/b2b-coverage.service';
import { B2BOverdueSweepService } from '../../src/modules/b2b-sales-crm/services/b2b-overdue-sweep.service';

const silentLogger = {
  infoContext: () => undefined,
  debugContext: () => undefined,
  warnContext: () => undefined,
  errorContext: () => undefined,
};

export interface CoverageHarness {
  moduleRef: TestingModule;
  sequelize: Sequelize;
  coverage: B2BCoverageService;
  sweep: B2BOverdueSweepService;
  messaging: { withCarrier: jest.Mock };
  close: () => Promise<void>;
}

export async function buildCoverageHarness(databaseUrl: string): Promise<CoverageHarness> {
  const messaging = { withCarrier: jest.fn(() => null) };
  const moduleRef = await Test.createTestingModule({
    imports: [
      SequelizeModule.forRoot({
        dialect: 'postgres',
        uri: databaseUrl,
        dialectOptions: { options: '-c search_path=atlas_sales,atlas_accounting,public' },
        autoLoadModels: false,
        synchronize: false,
        models: atlasSalesModels,
        logging: false,
        pool: { max: 8 },
      }),
      SequelizeModule.forFeature(atlasSalesModels),
    ],
    providers: [
      B2BSalesCrmRepository,
      B2BCoverageService,
      B2BOverdueSweepService,
      { provide: PinoLoggerService, useValue: silentLogger },
      { provide: MessagingTraceService, useValue: messaging },
    ],
  }).compile();

  const sequelize = moduleRef.get<Sequelize>(getConnectionToken());
  return {
    moduleRef,
    sequelize,
    coverage: moduleRef.get(B2BCoverageService),
    sweep: moduleRef.get(B2BOverdueSweepService),
    messaging,
    close: async () => {
      await moduleRef.close();
    },
  };
}

async function insert(sequelize: Sequelize, sql: string, bind: unknown[]): Promise<string> {
  const rows = await sequelize.query<{ id: string }>(`${sql} RETURNING id`, {
    bind,
    type: QueryTypes.SELECT,
  });
  return rows[0]!.id;
}

export interface SeededInstallment {
  id: string;
  number: number;
}

export interface SeededPurchase {
  merchantAccountId: string;
  otherAccountId: string;
  purchaseId: string;
  contractId: string;
  contractVersionId: string;
  consumerId: string;
  installments: SeededInstallment[];
}

export async function seedPurchase(
  sequelize: Sequelize,
  input: {
    installments: Array<{ dueDate: string; amount: string; status?: string }>;
    contractStatus?: string;
    purchaseStatus?: string;
  },
): Promise<SeededPurchase> {
  const tag = randomUUID().slice(0, 8);
  const account = (name: string) =>
    insert(
      sequelize,
      `INSERT INTO atlas_sales.b2b_accounts (legal_name, trade_name, tax_id, lifecycle_status, category, business_line)
       VALUES ($1, $1, $2, 'CUSTOMER', 'PRUEBA', 'PRUEBA')`,
      [`Comercio sintético ${name} ${tag}`, `NIT-${name}-${tag}`],
    );
  const merchantAccountId = await account('A');
  const otherAccountId = await account('B');
  const contractId = await insert(
    sequelize,
    `INSERT INTO atlas_sales.b2b_contracts (account_id, contract_number, status, start_date)
     VALUES ($1, $2, $3, '2026-01-01')`,
    [merchantAccountId, `CT-${tag}`, input.contractStatus ?? 'ACTIVE'],
  );
  const contractVersionId = await insert(
    sequelize,
    `INSERT INTO atlas_sales.contract_versions (contract_id, version_number, valid_from, status)
     VALUES ($1, 3, '2026-01-01', 'ACTIVE')`,
    [contractId],
  );
  const consumerId = randomUUID();
  await sequelize.query(
    'INSERT INTO atlas_sales.consumers_ref (id, external_ref) VALUES ($1, $2)',
    {
      bind: [consumerId, `consumidor-sintetico-${tag}`],
    },
  );
  const total = input.installments.reduce(
    (sum, installment) => sum + BigInt(installment.amount.replace('.', '')),
    0n,
  );
  const financed = `${total / 100n}.${String(total % 100n).padStart(2, '0')}`;
  const purchaseId = await insert(
    sequelize,
    `INSERT INTO atlas_sales.bnpl_purchases
       (merchant_account_id, consumer_id, contract_version_id, purchase_amount, down_payment_amount, financed_amount, status)
     VALUES ($1, $2, $3, $4, 0, $4, $5)`,
    [
      merchantAccountId,
      consumerId,
      contractVersionId,
      financed,
      input.purchaseStatus ?? 'CONFIRMED',
    ],
  );
  const installments: SeededInstallment[] = [];
  for (const [index, installment] of input.installments.entries()) {
    const id = await insert(
      sequelize,
      `INSERT INTO atlas_sales.bnpl_installments (purchase_id, installment_number, due_date, amount, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        purchaseId,
        index + 1,
        installment.dueDate,
        installment.amount,
        installment.status ?? 'SCHEDULED',
      ],
    );
    installments.push({ id, number: index + 1 });
  }
  return {
    merchantAccountId,
    otherAccountId,
    purchaseId,
    contractId,
    contractVersionId,
    consumerId,
    installments,
  };
}

export async function addNotice(
  sequelize: Sequelize,
  purchase: SeededPurchase,
  installmentId: string,
  input: { status: 'REPORTED' | 'CONFIRMED' | 'REJECTED'; amount: string; createdAt?: Date },
): Promise<string> {
  return insert(
    sequelize,
    `INSERT INTO atlas_sales.consumer_payments_to_merchant
       (purchase_id, installment_id, amount, paid_at, status, created_at)
     VALUES ($1, $2, $3, now(), $4, $5)`,
    [purchase.purchaseId, installmentId, input.amount, input.status, input.createdAt ?? new Date()],
  );
}

export async function addEvidenceFile(
  sequelize: Sequelize,
  ownerId: string,
  status = 'ACTIVE',
): Promise<string> {
  return insert(
    sequelize,
    `INSERT INTO atlas_accounting.erp_file
       (owner_type, owner_id, file_name, storage_public_id, secure_url, status)
     VALUES ('MERCHANT_PAYABLE', $1, 'comprobante-sintetico.pdf', $2, 'https://example.invalid/sintetico', $3)`,
    [ownerId, `sintetico/${randomUUID()}`, status],
  );
}

export async function count(
  sequelize: Sequelize,
  sql: string,
  bind: unknown[] = [],
): Promise<number> {
  const rows = await sequelize.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${sql}`, {
    bind,
    type: QueryTypes.SELECT,
  });
  return Number(rows[0]!.n);
}

export async function one<T extends object>(
  sequelize: Sequelize,
  sql: string,
  bind: unknown[] = [],
): Promise<T> {
  const rows = await sequelize.query<T>(sql, { bind, type: QueryTypes.SELECT });
  if (rows.length !== 1) throw new Error(`Se esperaba una fila y hubo ${rows.length}: ${sql}`);
  return rows[0]!;
}
