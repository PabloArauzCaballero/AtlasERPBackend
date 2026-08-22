import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { env } from '../config/env';
import { PinoLoggerService } from '../common/logging/pino-logger.service';
import { LEGACY_SQL_PROBES, STARTUP_MIGRATION_FILES } from './startup-migrations';

const REFERENCE_SEEDS = [
  'src/database/seeders/001_reference_chart_of_accounts.sql',
  'src/database/seeders/20260708204000-seed-atlas-ads-defaults.sql',
  'src/database/seeders/20260712121000-seed-b2b-account-taxonomy.sql',
];
const DEVELOPMENT_SEEDS = [
  'src/database/seeders/20260708191000-seed-atlas-b2b-sales-crm.sql',
  // Membresía de los dos partners de desarrollo. Va DESPUÉS del seed base porque necesita los
  // tipos y enums que aquél deja en su sitio, y su contraparte —la identidad con contraseña— la
  // siembra AtlasBackend en su perfil `development`.
  'src/database/seeders/20260821140000-seed-partners-desarrollo.sql',
];

@Injectable()
export class DatabaseSeederService implements OnApplicationBootstrap {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!env.STARTUP_MIGRATIONS_ENABLED && !env.STARTUP_SEEDS_ENABLED) return;
    const seeds = !env.STARTUP_SEEDS_ENABLED
      ? []
      : env.NODE_ENV === 'production'
        ? REFERENCE_SEEDS
        : [...REFERENCE_SEEDS, ...DEVELOPMENT_SEEDS];
    let appliedMigrations = 0;
    await this.sequelize.transaction(async (transaction) => {
      await this.sequelize.query(
        "SELECT pg_advisory_xact_lock(hashtext('atlas:startup-seeds:v1'))",
        { transaction },
      );
      if (env.STARTUP_MIGRATIONS_ENABLED) {
        appliedMigrations = await this.applyPendingMigrations(transaction);
      }
      for (const file of seeds) {
        const sql = await readFile(resolve(file), 'utf8');
        // Los seeds comparten conexión: un `SET search_path` dentro de un archivo
        // (p. ej. atlas_accounting) se filtraría al siguiente, que resuelve sus
        // tablas por el search_path por defecto.
        await this.sequelize.query('RESET search_path', { transaction });
        await this.sequelize.query(sql, { transaction });
      }
      // La conexión vuelve al pool sin arrastrar el search_path del último seed.
      await this.sequelize.query('RESET search_path', { transaction });
    });
    this.logger.infoContext(
      DatabaseSeederService.name,
      'Idempotent startup migrations and seeds verified',
      {
        appliedMigrations,
        pendingMigrationsChecked: env.STARTUP_MIGRATIONS_ENABLED
          ? STARTUP_MIGRATION_FILES.length
          : 0,
        seedCount: seeds.length,
        includesDevelopmentFixtures: env.STARTUP_SEEDS_ENABLED && env.NODE_ENV !== 'production',
      },
    );
  }

  // Misma tabla de control y claves que scripts/db/run-sql.ts: cada archivo se aplica
  // una sola vez, así el arranque es idempotente aunque el DDL no use IF NOT EXISTS.
  private async applyPendingMigrations(transaction: Transaction): Promise<number> {
    await this.sequelize.query(
      `CREATE TABLE IF NOT EXISTS public.atlas_sql_migrations (
        file_path text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
      { transaction },
    );

    let applied = 0;
    for (const file of STARTUP_MIGRATION_FILES) {
      const migrationKey = relative(process.cwd(), resolve(file)).replace(/\\/g, '/');
      const sql = await readFile(resolve(file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const [existing] = await this.sequelize.query<{ checksum: string }>(
        'SELECT checksum FROM public.atlas_sql_migrations WHERE file_path = $1',
        { bind: [migrationKey], type: QueryTypes.SELECT, transaction },
      );

      if (existing) {
        if (existing.checksum !== checksum) {
          throw new Error(`El SQL ya aplicado cambió de contenido: ${migrationKey}`);
        }
        continue;
      }

      await this.sequelize.query('RESET search_path', { transaction });
      if (!(await this.wasLegacySqlAlreadyApplied(migrationKey, transaction))) {
        await this.sequelize.query(sql, { transaction });
        applied += 1;
        this.logger.infoContext(DatabaseSeederService.name, 'Startup migration applied', {
          filePath: migrationKey,
        });
      }
      await this.sequelize.query(
        'INSERT INTO public.atlas_sql_migrations(file_path, checksum) VALUES ($1, $2) ON CONFLICT (file_path) DO NOTHING',
        { bind: [migrationKey, checksum], transaction },
      );
    }
    await this.sequelize.query('RESET search_path', { transaction });
    return applied;
  }

  private async wasLegacySqlAlreadyApplied(
    migrationKey: string,
    transaction: Transaction,
  ): Promise<boolean> {
    const probe = LEGACY_SQL_PROBES.find((candidate) => candidate.filePath === migrationKey);
    if (!probe) return false;
    const [row] = await this.sequelize.query<{ exists: boolean }>(probe.sql, {
      type: QueryTypes.SELECT,
      transaction,
    });
    return row?.exists === true;
  }
}
