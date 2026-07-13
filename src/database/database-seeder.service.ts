import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Sequelize } from 'sequelize-typescript';
import { env } from '../config/env';
import { PinoLoggerService } from '../common/logging/pino-logger.service';

const REFERENCE_SEEDS = [
  'src/database/seeders/001_reference_chart_of_accounts.sql',
  'src/database/seeders/20260708204000-seed-atlas-ads-defaults.sql',
  'src/database/seeders/20260712121000-seed-b2b-account-taxonomy.sql',
];
const DEVELOPMENT_SEEDS = ['src/database/seeders/20260708191000-seed-atlas-b2b-sales-crm.sql'];

@Injectable()
export class DatabaseSeederService implements OnApplicationBootstrap {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!env.STARTUP_SEEDS_ENABLED) return;
    const files = env.NODE_ENV === 'production' ? REFERENCE_SEEDS : [...REFERENCE_SEEDS, ...DEVELOPMENT_SEEDS];
    await this.sequelize.transaction(async (transaction) => {
      await this.sequelize.query("SELECT pg_advisory_xact_lock(hashtext('atlas:startup-seeds:v1'))", { transaction });
      for (const file of files) {
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
    this.logger.infoContext(DatabaseSeederService.name, 'Idempotent startup seeds verified', {
      seedCount: files.length,
      includesDevelopmentFixtures: env.NODE_ENV !== 'production',
    });
  }
}
