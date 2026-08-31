/**
 * Comprueba que las TRES listas de migraciones SQL digan lo mismo.
 *
 * El ERP declara el mismo conjunto en tres sitios: el guion `db:migrate:prod` (lo que corren el
 * compose y produccion), los guiones `db:migrate:*` por dominio (lo que corre un desarrollador) y
 * `STARTUP_MIGRATION_FILES` (lo que aplica la API al arrancar). Nada obligaba a que coincidieran, y
 * no coincidian: `db:migrate:prod` omitia `20260826100000-b2b-account-archive.sql`, asi que ningun
 * despliegue tenia `b2b_accounts.archived_at` y la funcion de archivado estaba rota en produccion
 * mientras funcionaba en el portatil de quien la escribio. La lista de arranque, por su parte, se
 * habia quedado en 14 de 22.
 *
 * Una deriva asi no la ve nadie: cada lista es coherente consigo misma y cada entorno es coherente
 * con la suya. Solo aparece cuando dos entornos tienen que compartir datos. Esta comprobacion es
 * estatica —lee el `package.json` y el modulo— y por eso puede correr en CI sin base de datos.
 *
 * Ejecutar con `npm run check:migration-lists`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STARTUP_MIGRATION_FILES } from '../../src/database/startup-migrations';

const DEV_SCRIPTS = [
  'db:migrate:crm',
  'db:migrate:accounting',
  'db:migrate:ads',
  'db:migrate:audit',
  'db:migrate:portal',
];

const SQL_PATH = /src\/database\/[A-Za-z0-9_/.-]+\.sql/g;

function filesIn(command: string | undefined): string[] {
  return [...(command ?? '').matchAll(SQL_PATH)].map((match) => match[0]);
}

function report(title: string, missing: string[]): boolean {
  if (missing.length === 0) return false;
  console.error(`\n❌ ${title}`);
  for (const file of missing) console.error(`   - ${file}`);
  return true;
}

function main(): void {
  const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };

  const prod = filesIn(packageJson.scripts['db:migrate:prod']);
  const dev = DEV_SCRIPTS.flatMap((name) => filesIn(packageJson.scripts[name]));
  // `as const` en el modulo hace que el tipo sea la union de literales; aqui se comparan
  // rutas como texto, asi que se ensancha a `string[]`.
  const startup: string[] = [...STARTUP_MIGRATION_FILES];

  const prodSet = new Set<string>(prod);
  const devSet = new Set<string>(dev);
  const startupSet = new Set<string>(startup);

  let failed = false;
  failed =
    report(
      'En los guiones de desarrollo pero NO en `db:migrate:prod` (produccion no las aplica):',
      [...devSet].filter((file) => !prodSet.has(file)).sort(),
    ) || failed;
  failed =
    report(
      'En `db:migrate:prod` pero NO en los guiones de desarrollo:',
      [...prodSet].filter((file) => !devSet.has(file)).sort(),
    ) || failed;
  failed =
    report(
      'En `db:migrate:prod` pero NO en STARTUP_MIGRATION_FILES (el arranque no las cubre):',
      [...prodSet].filter((file) => !startupSet.has(file)).sort(),
    ) || failed;
  failed =
    report(
      'En STARTUP_MIGRATION_FILES pero NO en `db:migrate:prod`:',
      [...startupSet].filter((file) => !prodSet.has(file)).sort(),
    ) || failed;

  // Un archivo declarado que no existe rompe el despliegue con «no such file», que se lee como un
  // fallo de base de datos y es un fallo de EMPAQUETADO.
  failed =
    report(
      'Declarados en alguna lista pero AUSENTES del repositorio:',
      [...new Set([...prod, ...dev, ...startup])]
        .filter((file) => !existsSync(resolve(file)))
        .sort(),
    ) || failed;

  // El orden importa entre schemas dependientes, asi que las dos listas ejecutables deben coincidir
  // tambien en el ORDEN, no solo en el conjunto.
  const prodOrder = prod.join('\n');
  const startupOrder = startup.join('\n');
  if (prodOrder !== startupOrder) {
    console.error(
      '\n❌ `db:migrate:prod` y STARTUP_MIGRATION_FILES declaran el mismo conjunto en distinto ORDEN.',
    );
    console.error('   Las dependencias entre schemas hacen que el orden sea parte del contrato.');
    failed = true;
  }

  if (failed) {
    console.error(
      '\n   Las tres listas describen el mismo conjunto de migraciones y tienen que decir lo mismo.',
    );
    process.exit(1);
  }

  console.log(`✅ Las tres listas de migraciones coinciden: ${prod.length} archivos, mismo orden.`);
}

main();
