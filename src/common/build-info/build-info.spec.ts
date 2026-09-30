import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  isCommitSha,
  loadBuildInfo,
  parseBuildInfo,
  readCommitFromGitDir,
  resolveServedIdentity,
  UNKNOWN_COMMIT,
} from './build-info';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const BUILT_AT = '2026-09-30T01:02:03.000Z';

describe('resolveServedIdentity', () => {
  it('sirve el commit compilado', () => {
    expect(resolveServedIdentity({ commit: SHA_A, builtAt: BUILT_AT }, undefined)).toEqual({
      commit: SHA_A,
      builtAt: BUILT_AT,
      runtimeConflict: false,
    });
  });

  it('OP-01: sin commit compilado ni de runtime devuelve unknown, nunca cadena vacía', () => {
    for (const runtime of [undefined, '', '   ', 'null']) {
      const served = resolveServedIdentity({ commit: null, builtAt: null }, runtime);
      expect(served.commit).toBe(UNKNOWN_COMMIT);
      expect(served.commit).not.toBe('');
    }
  });

  it('OP-06: una variable de runtime contradictoria NO suplanta el commit compilado', () => {
    const served = resolveServedIdentity({ commit: SHA_A, builtAt: BUILT_AT }, SHA_B);
    expect(served.commit).toBe(SHA_A);
    expect(served.runtimeConflict).toBe(true);
  });

  it('OP-06: una variable de runtime vacía no enmascara ni marca conflicto', () => {
    const served = resolveServedIdentity({ commit: SHA_A, builtAt: BUILT_AT }, '');
    expect(served).toMatchObject({ commit: SHA_A, runtimeConflict: false });
  });

  it('si el artefacto no trae commit, usa el de runtime sólo si es un SHA completo', () => {
    expect(resolveServedIdentity({ commit: null, builtAt: null }, SHA_B).commit).toBe(SHA_B);
    expect(resolveServedIdentity({ commit: null, builtAt: null }, 'abc1234').commit).toBe(
      UNKNOWN_COMMIT,
    );
  });
});

describe('parseBuildInfo / loadBuildInfo', () => {
  it('descarta commit y fecha que no sean válidos', () => {
    expect(parseBuildInfo(JSON.stringify({ commit: 'no-es-sha', builtAt: 'ayer' }))).toEqual({
      commit: null,
      builtAt: null,
    });
    expect(parseBuildInfo('{roto')).toEqual({ commit: null, builtAt: null });
    expect(parseBuildInfo('null')).toEqual({ commit: null, builtAt: null });
  });

  it('un archivo ausente da identidad vacía sin lanzar', () => {
    expect(loadBuildInfo(join(tmpdir(), 'no-existe', 'build-info.json'))).toEqual({
      commit: null,
      builtAt: null,
    });
  });

  it('isCommitSha exige 40 hex en minúsculas', () => {
    expect(isCommitSha(SHA_A)).toBe(true);
    expect(isCommitSha(SHA_A.toUpperCase())).toBe(false);
    expect(isCommitSha(SHA_A.slice(1))).toBe(false);
    expect(isCommitSha(undefined)).toBe(false);
  });
});

describe('readCommitFromGitDir', () => {
  const gitDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitdir-'));
    mkdirSync(join(dir, 'refs', 'heads'), { recursive: true });
    return dir;
  };

  it('HEAD desacoplado (así clona Coolify)', () => {
    const dir = gitDir();
    writeFileSync(join(dir, 'HEAD'), `${SHA_A}\n`);
    expect(readCommitFromGitDir(dir)).toBe(SHA_A);
  });

  it('HEAD que apunta a un ref suelto', () => {
    const dir = gitDir();
    writeFileSync(join(dir, 'HEAD'), 'ref: refs/heads/dev\n');
    writeFileSync(join(dir, 'refs', 'heads', 'dev'), `${SHA_B}\n`);
    expect(readCommitFromGitDir(dir)).toBe(SHA_B);
  });

  it('HEAD que apunta a un ref sólo empaquetado', () => {
    const dir = gitDir();
    writeFileSync(join(dir, 'HEAD'), 'ref: refs/heads/dev\n');
    writeFileSync(
      join(dir, 'packed-refs'),
      `# pack-refs\n${SHA_A} refs/heads/otra\n${SHA_B} refs/heads/dev\n`,
    );
    expect(readCommitFromGitDir(dir)).toBe(SHA_B);
  });

  it('sin .git o con ref irresoluble da null', () => {
    expect(readCommitFromGitDir(join(tmpdir(), 'nada'))).toBeNull();
    const dir = gitDir();
    writeFileSync(join(dir, 'HEAD'), 'ref: refs/heads/fantasma\n');
    expect(readCommitFromGitDir(dir)).toBeNull();
  });
});

describe('scripts/ops/write-build-info.ts (ejecutado de verdad)', () => {
  const script = resolve(__dirname, '../../../scripts/ops/write-build-info.ts');
  const tsx = resolve(__dirname, '../../../node_modules/.bin/tsx');
  const run = (cwd: string, env: Record<string, string>) => {
    const out = join(cwd, 'dist', 'build-info.json');
    execFileSync(tsx, [script, out], {
      cwd,
      env: { PATH: process.env.PATH ?? '', ...env },
      stdio: 'pipe',
    });
    return JSON.parse(readFileSync(out, 'utf8')) as { commit: string | null; builtAt: string };
  };

  it('toma SOURCE_COMMIT válido y sella builtAt', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wbi-'));
    const info = run(cwd, { SOURCE_COMMIT: SHA_A });
    expect(info.commit).toBe(SHA_A);
    expect(Number.isNaN(Date.parse(info.builtAt))).toBe(false);
  });

  it('SOURCE_COMMIT vacío cae a .git del checkout', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wbi-'));
    mkdirSync(join(cwd, '.git'));
    writeFileSync(join(cwd, '.git', 'HEAD'), `${SHA_B}\n`);
    expect(run(cwd, { SOURCE_COMMIT: '' }).commit).toBe(SHA_B);
  });

  it('SOURCE_COMMIT basura y sin .git deja null sin fallar el build', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wbi-'));
    expect(run(cwd, { SOURCE_COMMIT: 'HEAD' }).commit).toBeNull();
  });
});
