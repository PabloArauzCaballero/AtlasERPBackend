import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ZodTypeAny } from 'zod';
import { STARTUP_MIGRATION_FILES } from '../src/database/startup-migrations';
import { ALL_DOMAINS } from '../src/modules/catalog/domains';
import { AUDIENCE_ATTRIBUTES } from '../src/modules/ads/ads.segmentation';
import {
  CREDIT_APPLICANT_ATTRIBUTES,
  PARTNER_ATTRIBUTES,
} from '../src/modules/b2b-sales-crm/domain/crm-segments';

/**
 * El catálogo de dominios es la ÚNICA lista de valores válidos de cada campo cerrado. Esta prueba
 * impide que vuelva a haber copias que divergen, en las dos direcciones que ya fallaron:
 *
 * 1. **Dominio ↔ base.** Cada dominio que declara un CHECK o un ENUM de Postgres tiene exactamente
 *    sus valores, leídos de las migraciones en el orden en que se aplican. Es la comprobación que
 *    habría cazado el 500 de `gl_account.status` (Zod aceptaba ARCHIVED; el CHECK, no).
 * 2. **Esquema ↔ dominio.** Cada `z.enum`/`z.nativeEnum` de un esquema de entrada coincide con un
 *    dominio registrado. Un enum nuevo sin dominio es un select que el frontend tendría que copiar.
 *
 * Estática a propósito: lee los `.sql` y los esquemas, así que corre en CI sin base de datos.
 */

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

const literals = (list: string) => [...list.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]!);

/** CHECK por nombre y ENUM por tipo, aplicando las migraciones en orden (la última definición gana). */
function readDatabaseVocabulary() {
  const checks = new Map<string, string[]>();
  const enums = new Map<string, string[]>();
  for (const file of STARTUP_MIGRATION_FILES) {
    const sql = readFileSync(resolve(file), 'utf8').replace(/--[^\n]*/g, '');
    for (const match of sql.matchAll(
      /CONSTRAINT\s+([a-z0-9_]+)\s+CHECK\s*\(\s*\(?\s*[a-z0-9_]+\s*\)?\s+IN\s*\(([^)]*)\)/gi,
    )) {
      checks.set(match[1]!.toLowerCase(), literals(match[2]!));
    }
    for (const match of sql.matchAll(/CREATE\s+TYPE\s+([a-z0-9_.]+)\s+AS\s+ENUM\s*\(([^)]*)\)/gi)) {
      enums.set(match[1]!.toLowerCase(), literals(match[2]!));
    }
    for (const match of sql.matchAll(
      /ALTER\s+TYPE\s+([a-z0-9_.]+)\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'([^']+)'/gi,
    )) {
      const current = enums.get(match[1]!.toLowerCase()) ?? [];
      if (!current.includes(match[2]!)) current.push(match[2]!);
      enums.set(match[1]!.toLowerCase(), current);
    }
  }
  return { checks, enums };
}

describe('catálogo de dominios ↔ base de datos', () => {
  const { checks, enums } = readDatabaseVocabulary();
  const bindings = ALL_DOMAINS.flatMap((domain) =>
    domain.database.map((binding) => ({ domain, binding })),
  );

  it('declara al menos los CHECK y ENUM conocidos', () => {
    expect(bindings.length).toBeGreaterThanOrEqual(40);
  });

  it.each(bindings.map(({ domain, binding }) => [domain.name, binding] as const))(
    '%s coincide con su respaldo en Postgres',
    (name, binding) => {
      const domain = ALL_DOMAINS.find((candidate) => candidate.name === name)!;
      const inDatabase =
        'check' in binding
          ? checks.get(binding.check.toLowerCase())
          : enums.get(binding.enumType.toLowerCase());
      if (!inDatabase) {
        throw new Error(
          `${name}: no se encontró ${JSON.stringify(binding)} en ninguna migración de STARTUP_MIGRATION_FILES.`,
        );
      }
      expect({ name, values: [...inDatabase].sort() }).toEqual({
        name,
        values: [...domain.codes].sort(),
      });
    },
  );
});

type ZodDef = {
  typeName?: string;
  values?: unknown;
  shape?: () => Record<string, ZodTypeAny>;
  innerType?: ZodTypeAny;
  schema?: ZodTypeAny;
  type?: ZodTypeAny;
  in?: ZodTypeAny;
  out?: ZodTypeAny;
  options?: ZodTypeAny[] | Map<unknown, ZodTypeAny>;
  left?: ZodTypeAny;
  right?: ZodTypeAny;
  valueType?: ZodTypeAny;
  items?: ZodTypeAny[];
};

/** Todos los enums alcanzables desde un esquema, con la ruta por la que se llega. */
function collectEnums(root: unknown, origin: string, found: { path: string; values: string[] }[]) {
  const visited = new Set<unknown>();
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    const def = (node as { _def?: ZodDef })._def;
    if (!def?.typeName) return;
    visited.add(node);
    switch (def.typeName) {
      case 'ZodEnum':
        found.push({ path, values: [...(def.values as string[])] });
        return;
      case 'ZodNativeEnum':
        found.push({
          path,
          values: Object.values(def.values as Record<string, unknown>).filter(
            (value): value is string => typeof value === 'string',
          ),
        });
        return;
      case 'ZodObject': {
        const shape = (node as { shape: Record<string, ZodTypeAny> }).shape;
        for (const [key, child] of Object.entries(shape)) walk(child, `${path}.${key}`);
        return;
      }
      case 'ZodArray':
        walk(def.type, `${path}[]`);
        return;
      case 'ZodEffects':
        walk(def.schema, path);
        return;
      case 'ZodPipeline':
        walk(def.in, path);
        walk(def.out, path);
        return;
      case 'ZodUnion':
      case 'ZodDiscriminatedUnion': {
        const options =
          def.options instanceof Map ? [...def.options.values()] : (def.options ?? []);
        options.forEach((option, index) => walk(option, `${path}|${index}`));
        return;
      }
      case 'ZodIntersection':
        walk(def.left, path);
        walk(def.right, path);
        return;
      case 'ZodRecord':
        walk(def.valueType, `${path}{}`);
        return;
      case 'ZodTuple':
        (def.items ?? []).forEach((item, index) => walk(item, `${path}[${index}]`));
        return;
      default:
        walk(def.innerType, path);
    }
  };
  walk(root, origin);
}

function schemaFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return schemaFiles(full);
    return /\.schemas\.ts$/.test(entry) ? [full] : [];
  });
}

/*
 * Enums TÉCNICOS que no son vocabulario de negocio y nunca llegan a un select: banderas de query,
 * orden de un listado y los nombres de atributo de una regla de segmento (esos se publican con su
 * tipo en `GET /b2b/segments/vocabulary`).
 */
const TECHNICAL_ENUMS: readonly (readonly string[])[] = [
  ['true', 'false'],
  ['ASC', 'DESC'],
  ['createdAt', 'tradeName', 'legalName', 'lifecycleStatus'],
  Object.keys(AUDIENCE_ATTRIBUTES),
  Object.keys(PARTNER_ATTRIBUTES),
  Object.keys(CREDIT_APPLICANT_ATTRIBUTES),
  [...Object.keys(PARTNER_ATTRIBUTES), ...Object.keys(CREDIT_APPLICANT_ATTRIBUTES)],
];

/*
 * Estructuras que no son formularios de negocio: el payload de un documento generado describe cómo
 * se MAQUETA (tipo de campo impreso), no un dato que alguien elige.
 */
/*
 * Tampoco el sobre de eventos entre servicios (P-14): `spec` y `producer` son vocabulario del
 * protocolo atlas-integration-v1, fijado por su JSON Schema, no algo que una persona elija.
 */
const TECHNICAL_PATHS = [
  'src/modules/documents/documents.schemas.ts#generateDocumentSchema',
  'src/modules/b2b-sales-crm/integration/core-events.schemas.ts#coreEnvelopeSchema',
];

describe('esquemas de entrada ↔ catálogo de dominios', () => {
  const found: { path: string; values: string[] }[] = [];
  for (const file of schemaFiles(resolve('src/modules'))) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exported = require(file) as Record<string, unknown>;
    for (const [name, value] of Object.entries(exported)) {
      collectEnums(value, `${file.replace(resolve('.') + '/', '')}#${name}`, found);
    }
  }

  it('recorre los esquemas del ERP', () => {
    expect(found.length).toBeGreaterThanOrEqual(80);
  });

  it('cada z.enum de un esquema tiene su dominio registrado', () => {
    const unregistered = found.filter(
      ({ path, values }) =>
        !TECHNICAL_PATHS.some((prefix) => path.startsWith(prefix)) &&
        !TECHNICAL_ENUMS.some((technical) => sameSet(technical, values)) &&
        !ALL_DOMAINS.some((domain) => sameSet(domain.codes, values)),
    );
    const report = [
      ...new Map(unregistered.map((item) => [item.values.join(','), item])).values(),
    ].map(({ path, values }) => `${path}: [${values.join(', ')}]`);
    expect(report).toEqual([]);
  });
});
