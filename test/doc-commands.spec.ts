import { findUnknownCommands } from '../scripts/docs/check-doc-commands';

/** Comprobación de comandos documentados (P-15 / B17). */
describe('Comandos citados en la documentación', () => {
  const scripts = new Set(['db:migrate', 'db:migrate:prod', 'db:seed:pull', 'test']);
  const check = (content: string) => findUnknownCommands([{ path: 'x.md', content }], scripts);

  it('detecta un script inexistente con yarn, npm run, corepack yarn y node --run', () => {
    const findings = check(
      [
        'yarn db:prepare',
        'npm run db:rollback',
        'corepack yarn db:seed',
        'node --run db:migrate:status',
        'yarn run deploy:audit',
      ].join('\n'),
    );
    expect(findings.map((f) => f.script)).toEqual([
      'db:prepare',
      'db:rollback',
      'db:seed',
      'db:migrate:status',
      'deploy:audit',
    ]);
    expect(findings[0]).toMatchObject({ file: 'x.md', line: 1 });
  });

  it('acepta los scripts que existen y los subcomandos propios de yarn', () => {
    expect(
      check('yarn db:migrate\nnpm run db:migrate:prod\nyarn install --frozen-lockfile\nyarn audit'),
    ).toEqual([]);
  });

  it('no confunde un prefijo con el script completo', () => {
    expect(check('yarn db:seed:pull').map((f) => f.script)).toEqual([]);
    expect(check('yarn db:seed').map((f) => f.script)).toEqual(['db:seed']);
  });

  it('respeta la marca explícita de cita histórica', () => {
    expect(check('`yarn db:prepare` ya no existe <!-- doc-commands:ignore -->')).toEqual([]);
  });
});
