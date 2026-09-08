import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dos `@Roles` seguidos sobre la misma ruta: el de arriba gana y el de abajo se lee como si
 * mandara.
 *
 * Ha pasado dos veces (`onboarding.controller.ts`, `contracts.controller.ts`), y las dos con la
 * misma forma: un comentario largo separa un `@Roles` de su ruta, alguien añade la ruta siguiente
 * debajo con su propio `@Roles`, y la primera ruta se queda SIN roles —que `RolesGuard` interpreta
 * como «abierta a cualquier sesión»— mientras la segunda hereda unos que no eran suyos. `tsc` y
 * `jest` no lo ven: es TypeScript válido. Esta prueba lee los controladores como texto y falla si
 * entre dos `@Roles` no hay ningún decorador de ruta.
 */
function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith('.controller.ts') ? [full] : [];
  });
}

const ROUTE_DECORATOR = /^\s*@(Get|Post|Patch|Put|Delete|All|Head|Options)\b/;
const ROLES_DECORATOR = /^\s*@Roles\(/;

export function findStackedRoles(source: string): number[] {
  const offending: number[] = [];
  let pendingRolesLine: number | null = null;
  source.split('\n').forEach((line, index) => {
    if (ROLES_DECORATOR.test(line)) {
      if (pendingRolesLine !== null) offending.push(index + 1);
      pendingRolesLine = index + 1;
      return;
    }
    if (ROUTE_DECORATOR.test(line)) pendingRolesLine = null;
  });
  return offending;
}

describe('Controladores del ERP: ningún @Roles apilado sobre otro', () => {
  const files = controllerFiles(join(__dirname, '..', 'src', 'modules'));

  it('encuentra controladores que revisar', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => [file.replace(join(__dirname, '..'), ''), file]))(
    '%s',
    (_label, file) => {
      expect(findStackedRoles(readFileSync(file, 'utf8'))).toEqual([]);
    },
  );

  it('detecta el patrón que ya se coló dos veces', () => {
    const source = [
      "  @Roles('A')",
      '  /* comentario largo */',
      "  @Roles('B')",
      "  @Get('x')",
      '  x() {}',
    ].join('\n');
    expect(findStackedRoles(source)).toEqual([3]);
  });
});
