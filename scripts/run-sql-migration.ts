import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pino from 'pino';
import { Sequelize } from 'sequelize';
import { z } from 'zod';
import { resolveSequelizeSslOptions } from '../src/config/db-ssl';

const logger = pino({
  name: 'atlas-b2b-crm-ventas-migration',
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['DATABASE_URL', '*.DATABASE_URL'],
});

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DB_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Mismo contrato que `src/config/env.ts`: activar TLS no puede significar dejar de
  // validar el certificado, tampoco cuando quien conecta es un script de migración —que
  // corre con permisos de DDL y es, por tanto, la sesión que menos conviene interceptar.
  DB_SSL_REJECT_UNAUTHORIZED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  DB_SSL_CA: z.string().min(1).optional(),
  DB_SSL_CA_FILE: z.string().min(1).optional(),
});

async function main(): Promise<void> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }

  const sqlFilePath = process.argv[2];
  if (!sqlFilePath) {
    throw new Error('Uso: tsx scripts/run-sql-migration.ts <archivo.sql>');
  }

  const absoluteSqlFilePath = resolve(sqlFilePath);
  const sql = readFileSync(absoluteSqlFilePath, 'utf8');
  const sequelize = new Sequelize(parsed.data.DATABASE_URL, {
    dialect: 'postgres',
    ...(resolveSequelizeSslOptions(parsed.data) ?? {}),
    logging: false,
  });

  try {
    logger.info({ sqlFilePath: absoluteSqlFilePath }, 'Starting SQL migration script');
    await sequelize.authenticate();
    await sequelize.query(sql);
    logger.info({ sqlFilePath: absoluteSqlFilePath }, 'SQL migration script completed');
  } finally {
    await sequelize.close();
    logger.info({ sqlFilePath: absoluteSqlFilePath }, 'SQL migration database connection closed');
  }
}

void main().catch((error: unknown) => {
  logger.error(
    { errorName: error instanceof Error ? error.name : 'UnknownError' },
    error instanceof Error ? error.message : 'SQL migration script failed',
  );
  process.exit(1);
});
