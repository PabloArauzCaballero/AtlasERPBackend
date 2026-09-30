import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Identidad del artefacto que está corriendo.
 *
 * La autoridad es `dist/build-info.json`, escrito UNA vez durante el build (`scripts/ops/write-build-info.ts`)
 * y copiado dentro de la imagen. `APP_COMMIT_SHA` (variable de runtime) sólo rellena cuando el artefacto
 * no trae commit; nunca lo sustituye. Antes el commit dependía de que Coolify inyectara `SOURCE_COMMIT` al
 * arrancar, y una variable vacía llegaba tal cual a `/version` (`"commit":""`) porque `??` no atrapa `''`.
 */

const COMMIT_SHA = /^[0-9a-f]{40}$/;
export const UNKNOWN_COMMIT = 'unknown';

export interface BuildInfo {
  commit: string | null;
  builtAt: string | null;
}

export interface ServedIdentity {
  commit: string;
  builtAt: string | null;
  /** El runtime declaró un commit distinto del compilado; manda el compilado. */
  runtimeConflict: boolean;
}

export function isCommitSha(value: unknown): value is string {
  return typeof value === 'string' && COMMIT_SHA.test(value);
}

function isIsoInstant(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !Number.isNaN(Date.parse(value)) &&
    /^\d{4}-\d{2}-\d{2}T/.test(value)
  );
}

export function parseBuildInfo(raw: string): BuildInfo {
  try {
    const parsed: unknown = JSON.parse(raw);
    const record =
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    return {
      commit: isCommitSha(record.commit) ? record.commit : null,
      builtAt: isIsoInstant(record.builtAt) ? record.builtAt : null,
    };
  } catch {
    return { commit: null, builtAt: null };
  }
}

export function loadBuildInfo(path: string): BuildInfo {
  try {
    return parseBuildInfo(readFileSync(path, 'utf8'));
  } catch {
    return { commit: null, builtAt: null };
  }
}

/** Commit de un checkout leyendo `.git` sin el binario git (la imagen de build no lo trae). */
export function readCommitFromGitDir(gitDir: string): string | null {
  try {
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    if (isCommitSha(head)) return head;
    const ref = /^ref:\s*(\S+)$/.exec(head)?.[1];
    if (!ref) return null;
    try {
      const loose = readFileSync(join(gitDir, ref), 'utf8').trim();
      if (isCommitSha(loose)) return loose;
    } catch {
      // el ref puede estar sólo en packed-refs
    }
    const packed = readFileSync(join(gitDir, 'packed-refs'), 'utf8');
    for (const line of packed.split('\n')) {
      const [sha, name] = line.trim().split(' ');
      if (name === ref && isCommitSha(sha)) return sha;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveServedIdentity(
  build: BuildInfo,
  runtimeCommit: string | undefined,
): ServedIdentity {
  const runtime = isCommitSha(runtimeCommit?.trim()) ? (runtimeCommit as string).trim() : null;
  if (build.commit) {
    return {
      commit: build.commit,
      builtAt: build.builtAt,
      runtimeConflict: runtime !== null && runtime !== build.commit,
    };
  }
  return { commit: runtime ?? UNKNOWN_COMMIT, builtAt: build.builtAt, runtimeConflict: false };
}

export function buildInfoPath(): string {
  return process.env.BUILD_INFO_PATH ?? resolve(process.cwd(), 'dist', 'build-info.json');
}

let cached: ServedIdentity | undefined;

export function getServedIdentity(): ServedIdentity {
  cached ??= resolveServedIdentity(loadBuildInfo(buildInfoPath()), process.env.APP_COMMIT_SHA);
  return cached;
}
