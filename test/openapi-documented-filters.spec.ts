import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import { businessActionLogQuerySchema } from '../src/modules/business-action-logs/business-action-logs.schemas';

/**
 * El contrato publicado (docs/endpoints/openapi.yaml) documenta TODOS los filtros que el backend
 * acepta en el registro de actividad, cada uno con su descripción (adenda 2026-09-29, 4a): el
 * frontend expone aggregateId/moduleCode/actorUserId/from/to y la guía prometía buscarlos.
 */
const openapi = readFileSync(join(__dirname, '..', 'docs/endpoints/openapi.yaml'), 'utf8');

/** Bloque YAML de una ruta: desde su cabecera hasta la siguiente ruta de primer nivel. */
function pathBlock(path: string): string {
  const start = openapi.indexOf(`\n  ${path}:\n`);
  if (start < 0) throw new Error(`openapi.yaml no documenta ${path}`);
  const next = openapi.slice(start + 1).search(/\n {2}\/\S*:\n/);
  return next < 0 ? openapi.slice(start) : openapi.slice(start, start + 1 + next);
}

/** Parámetros `- name:` del bloque con su descripción (o null si no la tienen). */
function parameters(block: string): Map<string, string | null> {
  const found = new Map<string, string | null>();
  const chunks = block.split(/\n\s+- name: /).slice(1);
  for (const chunk of chunks) {
    const [name, ...rest] = chunk.split('\n');
    const description = /\n\s+description: (.+)/.exec(`\n${rest.join('\n')}`.split(/\n\s+- /)[0]!);
    found.set(name!.trim(), description ? description[1]!.trim() : null);
  }
  return found;
}

describe('OpenAPI · filtros del registro de actividad', () => {
  const schema = businessActionLogQuerySchema as unknown as z.ZodEffects<z.AnyZodObject>;
  const accepted = Object.keys(schema._def.schema.shape).sort();

  it('cada filtro que acepta GET /audit/business-actions está documentado con descripción', () => {
    const documented = parameters(pathBlock('/audit/business-actions'));
    expect([...documented.keys()].sort()).toEqual(accepted);
    const undocumented = [...documented.entries()].filter(([, d]) => !d).map(([name]) => name);
    expect(undocumented).toEqual([]);
  });

  it('no promete una búsqueda libre que el backend no tiene', () => {
    expect(accepted).not.toContain('search');
    expect(pathBlock('/audit/business-actions')).toMatch(/No hay búsqueda libre/);
  });
});

describe('OpenAPI · descripciones que dicen lo que hace la ruta', () => {
  it('pedir usuario de comercio deja INVITADO, no «usuario creado»', () => {
    const block = pathBlock('/b2b/onboarding/merchant-users');
    expect(block).not.toMatch(/description: Usuario creado/);
    expect(block).toMatch(/INVITED/);
  });

  it('activar el comercio declara la compuerta del Motor', () => {
    expect(pathBlock('/b2b/onboarding/cases/{onboardingCaseId}/activate')).toMatch(
      /decisionOutcome == 'APROBADO'/,
    );
  });

  it('la conciliación B2B detecta inconsistencias internas y no duplica abiertos', () => {
    const block = pathBlock('/b2b/reconciliation/runs');
    expect(block).toMatch(/inconsistencias INTERNAS/);
    expect(block).toMatch(/alreadyOpenItemCount/);
  });

  it('editar una cuenta GL avisa que tipo y naturaleza no se modifican', () => {
    expect(pathBlock('/accounting/financial-structure/gl-accounts/{id}')).toMatch(
      /`accountType` y `normalBalance` NO se modifican/,
    );
  });

  it('las cuentas bancarias declaran bankName y que no sale la huella del número', () => {
    const block = pathBlock('/accounting/financial-structure/bank-accounts');
    expect(block).toMatch(/bankName/);
    expect(block).toMatch(/NO trae\s+`accountNoHash`/);
  });
});
