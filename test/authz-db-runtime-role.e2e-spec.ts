/**
 * P-13 · Rol efectivo de base de datos en runtime.
 *
 * Estado del repositorio (medido, no supuesto): la API y el job `migrate` comparten `DATABASE_URL`
 * y la API migra y siembra al arrancar por omisión (`STARTUP_MIGRATIONS_ENABLED`/`STARTUP_SEEDS_
 * ENABLED` valen `true`), así que el runtime es el DUEÑO del esquema. Esta suite no puede cambiar
 * la configuración de los servidores; lo que demuestra es que la separación propuesta en
 * `infra/postgres/runtime-role.sql` funciona contra el esquema REAL:
 *
 * - el rol de runtime lee y escribe (DML) pero no puede crear, alterar, borrar ni vaciar tablas, ni
 *   desactivar los disparadores append-only que protegen los hechos contables;
 * - la API completa arranca y atiende una ruta financiera conectada con ese rol, con migraciones y
 *   siembras de arranque apagadas.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import * as request from 'supertest';
import { describeWithDatabase } from './support/coverage-integration-db';
import { bootAuthzHttpApp, signAccessToken } from './support/authz-http-app';
import type { AuthzHttpApp } from './support/authz-http-app';

const RUNTIME_ROLE_SQL = resolve('infra/postgres/runtime-role.sql');

describeWithDatabase('P-13 rol de runtime sin privilegios de migrador (PostgreSQL real)', () => {
  let h: AuthzHttpApp;
  let runtime: Client;
  const loginRole = `p13_app_${randomBytes(4).toString('hex')}`;
  const password = randomBytes(12).toString('hex');

  beforeAll(async () => {
    h = await bootAuthzHttpApp(
      'authz_dbrole',
      {},
      {
        beforeBoot: async (db) => {
          const owner = new Client({ connectionString: db.url });
          await owner.connect();
          try {
            // El registro que crea el job `migrate` en un despliegue real (`DatabaseSeederService`).
            await owner.query(
              'CREATE TABLE IF NOT EXISTS public.atlas_sql_migrations (name text PRIMARY KEY)',
            );
            await owner.query(readFileSync(RUNTIME_ROLE_SQL, 'utf8'));
            await owner.query(
              `CREATE ROLE ${loginRole} LOGIN PASSWORD '${password}' IN ROLE atlas_erp_runtime`,
            );
          } finally {
            await owner.end();
          }
          const url = new URL(db.url);
          url.username = loginRole;
          url.password = password;
          return url.toString();
        },
      },
    );
    runtime = new Client({ connectionString: process.env.DATABASE_URL });
    await runtime.connect();
    await runtime.query('SET search_path TO atlas_accounting, atlas_sales, atlas_audit, public');
  }, 180_000);

  afterAll(async () => {
    await runtime?.end().catch(() => undefined);
    await h?.close();
    const admin = new Client({ connectionString: process.env.ERP_INTEGRATION_DATABASE_URL });
    await admin.connect();
    await admin.query(`DROP ROLE IF EXISTS ${loginRole}`).catch(() => undefined);
    await admin.end();
  });

  const expectDenied = async (sql: string) => {
    await expect(runtime.query(sql)).rejects.toMatchObject({ code: '42501' });
  };

  it('el rol de runtime NO es superusuario ni dueño de las tablas', async () => {
    const { rows } = await runtime.query(
      `SELECT r.rolsuper, r.rolcreatedb, r.rolcreaterole,
              (SELECT count(*)::int FROM pg_tables t
                 WHERE t.schemaname IN ('atlas_sales','atlas_accounting','atlas_audit')
                   AND t.tableowner = current_user) AS owned
         FROM pg_roles r WHERE r.rolname = current_user`,
    );
    expect(rows[0]).toEqual({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      owned: 0,
    });
  });

  it('el rol de runtime lee y escribe (DML)', async () => {
    const code = `P13${randomBytes(3).toString('hex')}`.slice(0, 20);
    await runtime.query(`INSERT INTO legal_entity (code, legal_name) VALUES ($1, 'Entidad DML')`, [
      code,
    ]);
    await runtime.query(`UPDATE legal_entity SET legal_name = 'Entidad DML 2' WHERE code = $1`, [
      code,
    ]);
    const { rows } = await runtime.query('SELECT legal_name FROM legal_entity WHERE code = $1', [
      code,
    ]);
    expect(rows[0].legal_name).toBe('Entidad DML 2');
  });

  it.each([
    ['CREATE TABLE', 'CREATE TABLE atlas_accounting.p13_intrusa (id int)'],
    ['CREATE SCHEMA', 'CREATE SCHEMA p13_intruso'],
    ['ALTER TABLE', 'ALTER TABLE atlas_accounting.legal_entity ADD COLUMN p13 int'],
    ['DROP TABLE', 'DROP TABLE atlas_accounting.document_audit_log'],
    ['TRUNCATE', 'TRUNCATE atlas_accounting.journal_entry_line CASCADE'],
    [
      'DISABLE TRIGGER (append-only)',
      'ALTER TABLE atlas_accounting.document_audit_log DISABLE TRIGGER USER',
    ],
    [
      'CREATE FUNCTION en el esquema',
      'CREATE FUNCTION atlas_accounting.p13() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql',
    ],
    ['leer el registro de migraciones', 'SELECT * FROM public.atlas_sql_migrations'],
  ])('%s se rechaza con 42501 (permiso denegado)', async (_caso, sql) => {
    await expectDenied(sql);
  });

  it('contraste: con el rol DUEÑO (configuración actual del runtime) el mismo DISABLE TRIGGER pasa', async () => {
    await h.sql.query('BEGIN');
    try {
      await expect(
        h.sql.query('ALTER TABLE atlas_accounting.document_audit_log DISABLE TRIGGER USER'),
      ).resolves.toBeDefined();
    } finally {
      await h.sql.query('ROLLBACK');
    }
  });

  it('la API completa arranca con el rol de runtime y atiende una ruta financiera', async () => {
    const admin = signAccessToken({ sub: randomUUID(), roles: ['ADMIN'] });
    const res = await request(h.app.getHttpServer())
      .get('/api/v1/accounting/financial-structure/legal-entities')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const { rows } = await h.sql.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = $1`,
      [loginRole],
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });
});
