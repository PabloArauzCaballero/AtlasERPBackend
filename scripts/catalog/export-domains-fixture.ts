/**
 * Escribe la foto de `GET /catalog/domains` que usan las pruebas E2E del frontend del ERP.
 *
 * `AtlasERPFrontend/e2e/support/catalog-domains.json` es un doble del endpoint: los formularios ya
 * no copian sus listas, las piden, así que una prueba que no lo simule deja cada select vacío. La
 * foto se generaba a mano —`new CatalogService().list()` pegado en una consola— y por eso llevaba
 * meses sin la ayuda por valor que el backend ya publicaba.
 *
 * Sale del MISMO servicio que sirve el endpoint, no de los ficheros de dominios: si mañana
 * `publish()` deja de emitir un campo, la foto deja de traerlo también, que es justo lo que una
 * foto tiene que reflejar.
 *
 *     yarn catalog:fixture                      # al sitio de siempre (../AtlasERPFrontend/…)
 *     yarn catalog:fixture ruta/alternativa.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CatalogService } from '../../src/modules/catalog/catalog.service';

const DEFAULT_TARGET = '../AtlasERPFrontend/e2e/support/catalog-domains.json';

function main(): void {
  const target = resolve(process.cwd(), process.argv[2] ?? DEFAULT_TARGET);
  const { domains } = new CatalogService().list();

  const values = Object.values(domains).flat();
  const sinAyuda = values.filter((option) => !option.help?.trim()).length;
  if (sinAyuda > 0) {
    throw new Error(`${sinAyuda} valores sin ayuda: la foto no se escribe a medias.`);
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify({ domains }, null, 2)}\n`, 'utf8');
  console.log(
    `✅ ${Object.keys(domains).length} dominios y ${values.length} valores, todos con ayuda → ${target}`,
  );
}

main();
