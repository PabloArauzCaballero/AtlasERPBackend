/**
 * La aplicación HTTP COMPLETA del ERP contra una base PostgreSQL real y recién migrada (P-13).
 *
 * Levanta `AppModule` —las tres guardas globales (limitador, JWT, roles), los interceptores, el
 * filtro de excepciones y `cookie-parser`, como `main.ts`— para que las pruebas de permisos crucen
 * la MISMA frontera que un navegador: token → guarda → rol → servicio → fila. Un servicio probado
 * a mano no demuestra que el controlador le pase el usuario.
 *
 * `src/config/env` se evalúa al importarse, así que este módulo fija el entorno y sólo DESPUÉS
 * carga la aplicación (`require` diferido). Quien lo use no debe importar nada de `src/` antes.
 *
 * Sin `ERP_INTEGRATION_DATABASE_URL` las suites que lo usan se SALTAN visiblemente
 * (`describeWithDatabase`); con `ERP_INTEGRATION_REQUIRED=1` la ausencia es un fallo.
 */
import type { INestApplication } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { sign, type SignOptions } from 'jsonwebtoken';
import { Client } from 'pg';
import { createMigratedDatabase } from './coverage-integration-db';
import type { MigratedDatabase } from './coverage-integration-db';

export interface AuthzHttpApp {
  app: INestApplication;
  db: MigratedDatabase;
  sql: Client;
  close: () => Promise<void>;
}

export interface TokenClaims {
  sub: string;
  roles: string[];
  email?: string;
  legalEntityIds?: string[];
}

/** Valores de `test/set-env.ts` y los predeterminados de `env.ts`: los del guard real. */
export const ACCESS_SECRET = (): string => process.env.JWT_ACCESS_SECRET as string;
export const ACCESS_ISSUER = 'atlas-erp';
export const ACCESS_AUDIENCE = 'atlas-erp-api';

export function signAccessToken(claims: TokenClaims, options: SignOptions = {}): string {
  return sign({ ...claims, roleCode: claims.roles[0], tokenType: 'access' }, ACCESS_SECRET(), {
    algorithm: 'HS256',
    expiresIn: '10m',
    issuer: ACCESS_ISSUER,
    audience: ACCESS_AUDIENCE,
    ...options,
  });
}

export interface BootOptions {
  /**
   * Corre con la base ya migrada y ANTES de cargar la aplicación. Si devuelve una URL, la API se
   * conecta con ella en vez de con la del dueño (p. ej. con el rol de runtime sin DDL).
   */
  beforeBoot?: (db: MigratedDatabase) => Promise<string | void>;
}

export async function bootAuthzHttpApp(
  prefix: string,
  extraEnv: Record<string, string> = {},
  options: BootOptions = {},
): Promise<AuthzHttpApp> {
  const db = await createMigratedDatabase(prefix);
  const appUrl = (await options.beforeBoot?.(db)) ?? db.url;
  process.env.DATABASE_URL = appUrl;
  process.env.DB_SSL = 'false';
  process.env.STARTUP_MIGRATIONS_ENABLED = 'false';
  process.env.STARTUP_SEEDS_ENABLED = 'false';
  process.env.BNPL_OVERDUE_SWEEP_ENABLED = 'false';
  process.env.AUTH_DISABLED_FOR_LOCAL_TESTING = 'false';
  Object.assign(process.env, extraEnv);

  // Importaciones diferidas: `src/config/env` tiene que leer el entorno de ARRIBA.
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../../src/app.module');
  const { HttpExceptionFilter } = await import('../../src/common/filters/http-exception.filter');
  const { LoggingInterceptor } = await import('../../src/common/interceptors/logging.interceptor');
  const { ResponseInterceptor } =
    await import('../../src/common/interceptors/response.interceptor');
  const { TraceResponseInterceptor } =
    await import('../../src/common/observability/trace-response.interceptor');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalFilters(app.get(HttpExceptionFilter));
  app.useGlobalInterceptors(
    app.get(TraceResponseInterceptor),
    app.get(LoggingInterceptor),
    app.get(ResponseInterceptor),
  );
  await app.init();

  const sql = new Client({ connectionString: db.url });
  await sql.connect();
  await sql.query('SET search_path TO atlas_accounting, atlas_sales, atlas_audit, public');

  return {
    app,
    db,
    sql,
    close: async () => {
      await sql.end().catch(() => undefined);
      await app.close();
      await db.drop();
    },
  };
}
