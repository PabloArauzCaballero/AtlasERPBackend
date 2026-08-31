import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Client } from 'pg';
import { env } from '../config/env';
import { resolveDbSslOptions } from '../config/db-ssl';
import { PinoLoggerService } from '../common/logging/pino-logger.service';
import { resolveSeedSource } from './seed-source';
import { listSeededTables, syncSeedData } from './seed-sync';
import { LEGACY_SQL_PROBES, STARTUP_MIGRATION_FILES } from './startup-migrations';

/**
 * Las semillas ya no son archivos de este repositorio.
 *
 * `REFERENCE_SEEDS`/`DEVELOPMENT_SEEDS` enumeraban rutas `.sql` que este servicio leía del disco y
 * ejecutaba en cada arranque. Ahora el conjunto sembrado lo publica una RAMA de PostgreSQL
 * gestionado y el perfil es la rama a la que se apunta (`SEED_SOURCE_*`), de modo que ya no hay una
 * lista que mantener ni un `NODE_ENV` que decida qué fixtures entran: a la rama de producción no se
 * le puede pedir lo que no tiene.
 *
 * Las MIGRACIONES siguen siendo archivos versionados: el esquema es contrato del código.
 */

@Injectable()
export class DatabaseSeederService implements OnApplicationBootstrap {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!env.STARTUP_MIGRATIONS_ENABLED && !env.STARTUP_SEEDS_ENABLED) return;

    let appliedMigrations = 0;
    if (env.STARTUP_MIGRATIONS_ENABLED) {
      await this.sequelize.transaction(async (transaction) => {
        await this.sequelize.query(
          "SELECT pg_advisory_xact_lock(hashtext('atlas:startup-seeds:v1'))",
          { transaction },
        );
        appliedMigrations = await this.applyPendingMigrations(transaction);
      });
    }

    const seeded = env.STARTUP_SEEDS_ENABLED ? await this.pullSeedsIfEmpty() : null;

    this.logger.infoContext(
      DatabaseSeederService.name,
      'Idempotent startup migrations and seeds verified',
      {
        appliedMigrations,
        pendingMigrationsChecked: env.STARTUP_MIGRATIONS_ENABLED
          ? STARTUP_MIGRATION_FILES.length
          : 0,
        seededRows: seeded?.rows ?? 0,
        seededTables: seeded?.tables ?? 0,
      },
    );
  }

  /**
   * Trae el conjunto sembrado SÓLO si la base está vacía.
   *
   * La condición no es un detalle: la carga vacía las tablas del manifiesto antes de escribirlas,
   * así que hacerlo en cada arranque borraría el trabajo de la sesión anterior. Antes la salvaguarda
   * la daba gratis el propio mecanismo —cada `.sql` era un upsert idempotente—; ahora que la carga
   * es un reemplazo, la salvaguarda tiene que ser explícita. Para resembrar a propósito está
   * `npm run db:seed:pull`, que es un acto deliberado y no un efecto de reiniciar un proceso.
   */
  private async pullSeedsIfEmpty(): Promise<{ rows: number; tables: number } | null> {
    const source = resolveSeedSource();
    if (!source) {
      this.logger.infoContext(DatabaseSeederService.name, 'Startup seeding skipped: no SEED_SOURCE_* configured');
      return null;
    }

    const sourceClient = new Client({ connectionString: source.connectionString, ssl: source.ssl });
    const target = new Client({ connectionString: env.DATABASE_URL, ssl: resolveDbSslOptions(env) });
    await sourceClient.connect();
    await target.connect();
    try {
      const existing = await listSeededTables(target);
      if (existing.length > 0) {
        this.logger.infoContext(
          DatabaseSeederService.name,
          'Startup seeding skipped: database already has data',
          { populatedTables: existing.length },
        );
        return null;
      }
      return await syncSeedData({
        source: sourceClient,
        target,
        log: (message) =>
          this.logger.infoContext(DatabaseSeederService.name, message, { source: source.describe }),
      });
    } finally {
      await sourceClient.end();
      await target.end();
    }
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
