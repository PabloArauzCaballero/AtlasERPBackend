import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Gate `check:env-example` (P2-4): pasa sobre el repositorio y falla si falta una variable. */
const script = join(__dirname, '..', 'scripts', 'check-env-example.cjs');
const run = (...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

describe('check:env-example', () => {
  it('el .env.example del repositorio nombra todas las variables de src/config/env.ts', () => {
    const result = run();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('falla y nombra la variable del esquema que la plantilla no menciona', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-example-'));
    const schema = join(dir, 'env.ts');
    const template = join(dir, '.env.example');
    writeFileSync(
      schema,
      'const s = z.object({\n    PORT: z.coerce.number(),\n    SECRETO: z\n      .string(),\n});\n',
    );
    writeFileSync(template, 'PORT=3000\n');
    const missing = run('--schema', schema, '--template', template);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('- SECRETO');

    writeFileSync(template, 'PORT=3000\n# SECRETO=\n');
    expect(run('--schema', schema, '--template', template).status).toBe(0);
  });

  it('falla si el patrón deja de encontrar variables en el esquema (no da verde vacío)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-example-'));
    const schema = join(dir, 'env.ts');
    const template = join(dir, '.env.example');
    writeFileSync(schema, 'export const nada = 1;\n');
    writeFileSync(template, '');
    expect(run('--schema', schema, '--template', template).status).toBe(1);
  });
});
