import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Documentación que dice lo que hay (P2-6/P2-7, auditoría 2026-09-29): la arquitectura nombra
 * todos los módulos que el proceso registra, ninguna página copia a mano cifras de pruebas y
 * ningún documento vigente afirma que la factura AR valida una aceptación del SIN.
 */
const root = join(__dirname, '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

function markdownFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((entry) => {
    const path = join(root, dir, entry);
    if (statSync(path).isDirectory()) return markdownFiles(relative(root, path));
    return entry.endsWith('.md') ? [relative(root, path)] : [];
  });
}

describe('Documentación vigente', () => {
  it('architecture.md nombra cada módulo de dominio que importa app.module.ts', () => {
    const app = read('src/app.module.ts');
    const modules = [...app.matchAll(/import \{ (\w+Module) \} from '\.\/modules\//g)].map(
      (m) => m[1]!,
    );
    expect(modules.length).toBeGreaterThanOrEqual(15);
    const architecture = read('docs/architecture/architecture.md');
    expect(modules.filter((name) => !architecture.includes(`\`${name}\``))).toEqual([]);
  });

  it('README.md y ci.yml no copian a mano cifras de suites, pruebas o endpoints', () => {
    for (const file of ['README.md', '.github/workflows/ci.yml']) {
      const text = read(file);
      expect(text).not.toMatch(/\d+\s+suites?,\s*\d+\s+tests/);
      expect(text).not.toMatch(/\d+\s+endpoints/);
    }
  });

  it('ningún documento vigente afirma que se valida una aceptación del SIN', () => {
    const offenders = ['README.md', ...markdownFiles('docs')].filter((file) => {
      const text = read(file);
      return /trazabilidad SIAT aceptada|documento aceptado/.test(text) && !/HISTÓRICO/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
