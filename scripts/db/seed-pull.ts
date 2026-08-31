/**
 * Trae a esta base el conjunto sembrado que publica la rama de semillas.
 *
 * Sustituye a `db:seed` y a la importación del paquete de semillas oficiales: los datos ya no
 * viven en `src/database/seeders/` sino en una RAMA de PostgreSQL gestionado, y el perfil es la
 * rama a la que se apunta. Ver docs/base-de-datos/semillas.md.
 *
 *   tsx scripts/db/seed-pull.ts              copia el conjunto publicado (DESTRUCTIVO)
 *   tsx scripts/db/seed-pull.ts --if-empty   igual, pero no hace nada si la base ya tiene datos
 *   tsx scripts/db/seed-pull.ts status       compara sin escribir nada
 *
 * `--if-empty` existe para el arranque automatizado: traer semillas VACÍA las tablas del
 * manifiesto, así que un pull incondicional en cada arranque reemplazaría lo que hubiera.
 */
import { Client } from 'pg';
import { env } from '../../src/config/env';
import { resolveDbSslOptions } from '../../src/config/db-ssl';
import { requireSeedSource } from '../../src/database/seed-source';
import { hasSeedLoad, listSeededTables, syncSeedData } from '../../src/database/seed-sync';
import { PinoLoggerService } from '../../src/common/logging/pino-logger.service';

const logger = new PinoLoggerService();

function targetClient(): Client {
  return new Client({ connectionString: env.DATABASE_URL, ssl: resolveDbSslOptions(env) });
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'pull';
  const source = requireSeedSource();
  const sourceClient = new Client({ connectionString: source.connectionString, ssl: source.ssl });
  const target = targetClient();

  await sourceClient.connect();
  await target.connect();
  try {
    if (command === 'status') {
      const published = await listSeededTables(sourceClient);
      const local = new Map(
        (await listSeededTables(target)).map((table) => [
          `${table.schema}.${table.name}`,
          table.rows,
        ]),
      );
      const differences = published
        .map((table) => ({
          tabla: `${table.schema}.${table.name}`,
          publicado: table.rows,
          local: local.get(`${table.schema}.${table.name}`) ?? 0,
        }))
        .filter((row) => row.publicado !== row.local);

      logger.info('Estado de las semillas frente a la rama publicada.', {
        layer: 'script',
        script: 'seed-pull',
        source: source.describe,
        publishedTables: published.length,
        publishedRows: published.reduce((total, table) => total + table.rows, 0),
        differences: differences.length,
        inSync: differences.length === 0,
      });
      if (differences.length > 0) process.stdout.write(`${JSON.stringify(differences, null, 2)}\n`);
      return;
    }

    if (command !== 'pull') {
      throw new Error(`Comando no soportado: ${command}. Usa pull | status.`);
    }

    // La guarda mira la MARCA de carga, no el número de filas: una base recién migrada ya puede
    // tener datos, y contarlos hacía que el arranque automatizado se saltara la siembra en una base
    // virgen. Ver `hasSeedLoad`.
    if (process.argv.includes('--if-empty') && (await hasSeedLoad(target))) {
      logger.info('Siembra omitida: esta base ya trajo el conjunto sembrado.', {
        layer: 'script',
        script: 'seed-pull',
      });
      return;
    }

    logger.info('Trayendo el conjunto sembrado desde la rama de semillas.', {
      layer: 'script',
      script: 'seed-pull',
      source: source.describe,
    });
    const result = await syncSeedData({
      source: sourceClient,
      target,
      sourceLabel: source.describe,
    });
    logger.info('Semillas aplicadas.', {
      layer: 'script',
      script: 'seed-pull',
      source: source.describe,
      rows: result.rows,
      tables: result.tables,
    });
  } finally {
    await sourceClient.end();
    await target.end();
  }
}

main().catch((error: unknown) => {
  logger.error('No se pudo traer el conjunto sembrado.', {
    layer: 'script',
    script: 'seed-pull',
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
