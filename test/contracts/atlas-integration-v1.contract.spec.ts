/**
 * P-14 — conformidad del ERP con contracts/atlas-integration-v1 (copia versionada del de Core).
 *
 * El ERP produce `b2b.coverage.settled` / `b2b.recovery.*` y consume `payment.*` de Core. Aquí, sin
 * base ni red: la copia del contrato es íntegra y cita su origen; los fixtures cumplen el JSON Schema;
 * el receptor del ERP acepta exactamente los válidos de Core; la firma del outbox es la del contrato.
 * El PRODUCTOR real (lo que escribe la liquidación en el outbox) se valida contra el mismo esquema en
 * test/core-events.integration.spec.ts, con PostgreSQL.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  CONSUMED_CORE_TOPICS,
  coreEnvelopeSchema,
  isConsumedCoreTopic,
} from '../../src/modules/b2b-sales-crm/integration/core-events.schemas';
import {
  signOutboxBody,
  verifyOutboxSignature,
} from '../../src/workers/outbox/http-event-publisher';
import {
  loadSchemaRegistry,
  validateAgainst,
  validateEnvelope,
  type TopicEntry,
} from './atlas-integration/json-schema-subset';

const CONTRACT = resolve(__dirname, '../../contracts/atlas-integration-v1');
const registry = loadSchemaRegistry(CONTRACT);
const topics = (
  JSON.parse(readFileSync(join(CONTRACT, 'topics.json'), 'utf8')) as { topics: TopicEntry[] }
).topics;

type Case = { name: string; envelope: Record<string, unknown> };
type FixtureFile = { topic: string; valid: Case[]; boundary: Case[]; invalid: Case[] };
const fixtureFiles = readdirSync(join(CONTRACT, 'fixtures'))
  .filter((file) => file.endsWith('.v1.json'))
  .map((file) => JSON.parse(readFileSync(join(CONTRACT, 'fixtures', file), 'utf8')) as FixtureFile);
const sha256 = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

function erpAccepts(envelope: unknown): boolean {
  const parsed = coreEnvelopeSchema.safeParse(envelope);
  if (!parsed.success || !isConsumedCoreTopic(parsed.data.topic)) return false;
  return CONSUMED_CORE_TOPICS[parsed.data.topic].payload.safeParse(parsed.data.payload).success;
}

describe('atlas-integration-v1 · copia versionada en el ERP', () => {
  it('ORIGIN.json cita el repositorio y el commit de Core y la CHECKSUMS.sha256 que se copió', () => {
    const origin = JSON.parse(readFileSync(join(CONTRACT, 'ORIGIN.json'), 'utf8')) as Record<
      string,
      string
    >;
    expect(origin.sourceRepository).toBe('AtlasBackend');
    expect(origin.sourcePath).toBe('contracts/atlas-integration-v1');
    expect(origin.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(origin.checksumsSha256).toBe(sha256(join(CONTRACT, 'CHECKSUMS.sha256')));
  });

  it('CHECKSUMS.sha256 describe exactamente los archivos de la copia (nadie la editó a mano)', () => {
    const listFiles = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) =>
        statSync(join(dir, entry)).isDirectory() ? listFiles(join(dir, entry)) : [join(dir, entry)],
      );
    const expected = listFiles(CONTRACT)
      .map((file) => relative(CONTRACT, file))
      .filter((file) => file !== 'CHECKSUMS.sha256' && file !== 'ORIGIN.json')
      .sort()
      .map((file) => `${sha256(join(CONTRACT, file))}  ${file}`)
      .join('\n');
    expect(readFileSync(join(CONTRACT, 'CHECKSUMS.sha256'), 'utf8')).toBe(`${expected}\n`);
  });
});

describe('atlas-integration-v1 · fixtures contra el JSON Schema', () => {
  it('válidos y de frontera cumplen; inválidos fallan', () => {
    for (const file of fixtureFiles) {
      for (const sample of [...file.valid, ...file.boundary]) {
        expect({
          caso: sample.name,
          errores: validateEnvelope(registry, topics, sample.envelope),
        }).toEqual({ caso: sample.name, errores: [] });
      }
      for (const sample of file.invalid) {
        expect(validateEnvelope(registry, topics, sample.envelope).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('atlas-integration-v1 · el ERP como CONSUMIDOR de payment.* de Core', () => {
  const coreFiles = fixtureFiles.filter(
    (file) => topics.find((entry) => entry.topic === file.topic)?.producer === 'atlas-core',
  );

  it('el receptor acepta exactamente los fixtures válidos de Core y rechaza los inválidos', () => {
    expect(coreFiles.map((file) => file.topic).sort()).toEqual([
      'payment.confirmed',
      'payment.rejected',
      'payment.reported',
    ]);
    for (const file of coreFiles) {
      for (const sample of [...file.valid, ...file.boundary]) {
        expect({ caso: sample.name, acepta: erpAccepts(sample.envelope) }).toEqual({
          caso: sample.name,
          acepta: true,
        });
      }
      for (const sample of file.invalid) {
        expect({ caso: sample.name, acepta: erpAccepts(sample.envelope) }).toEqual({
          caso: sample.name,
          acepta: false,
        });
      }
    }
    const broken = JSON.parse(
      readFileSync(join(CONTRACT, 'fixtures/envelope.invalid.json'), 'utf8'),
    ) as { invalid: Case[] };
    for (const sample of broken.invalid) {
      expect(
        validateAgainst(registry, 'envelope.schema.json', sample.envelope).length,
      ).toBeGreaterThan(0);
      expect(erpAccepts(sample.envelope)).toBe(false);
    }
  });

  it('los tópicos que el ERP consume son los que topics.json declara con consumidor atlas-erp', () => {
    const declared = topics.filter((entry) => entry.consumer === 'atlas-erp').map((e) => e.topic);
    expect(Object.keys(CONSUMED_CORE_TOPICS).sort()).toEqual(declared.sort());
  });
});

describe('atlas-integration-v1 · firma', () => {
  it('el outbox del ERP firma y verifica igual que los vectores del contrato', () => {
    const file = JSON.parse(readFileSync(join(CONTRACT, 'signature/vectors.json'), 'utf8')) as {
      toleranceSeconds: number;
      vectors: Array<{ secret: string; timestamp: number; body: string; header: string }>;
    };
    for (const vector of file.vectors) {
      expect(signOutboxBody(vector.secret, vector.body, vector.timestamp)).toBe(vector.header);
      expect(
        verifyOutboxSignature({
          secret: vector.secret,
          header: vector.header,
          rawBody: vector.body,
          nowSeconds: vector.timestamp,
          toleranceSeconds: file.toleranceSeconds,
        }),
      ).toBe(true);
    }
  });
});
