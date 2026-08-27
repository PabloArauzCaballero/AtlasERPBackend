// Lista canónica y ordenada de migraciones SQL del backend integrado.
// La comparten el arranque de la app (DatabaseSeederService) y scripts/db/run-sql.ts;
// el orden respeta las dependencias entre schemas (atlas_sales → atlas_accounting → ads → audit).
export const STARTUP_MIGRATION_FILES = [
  'src/database/migrations/20260708190000-create-atlas-b2b-sales-crm.sql',
  'src/database/sql/accounting/001_schema_atlas_accounting.sql',
  'src/database/sql/accounting/002_hardening_atlas_accounting.sql',
  'src/database/sql/accounting/003_account_groups_and_entity_links.sql',
  'src/database/sql/accounting/004_erp_files.sql',
  'src/database/sql/accounting/005_business_partner_default_accounts.sql',
  'src/database/migrations/20260708203000-create-atlas-ads-schema.sql',
  'src/database/migrations/20260710120000-add-ads-email-messaging.sql',
  'src/database/migrations/20260709010000-create-business-action-logs.sql',
  'src/database/migrations/20260712120000-robust-b2b-account-profile.sql',
  'src/database/migrations/20260712140000-create-merchant-plans-subscriptions.sql',
  'src/database/migrations/20260712160000-merchant-accounting-bridge.sql',
  // Tarifas por alcance y por clics: las columnas que la pantalla de precios ya lee.
  'src/database/migrations/20260825020000-merchant-plans-por-alcance-y-clics.sql',
  // Catalogo de productos facturables: va DESPUES de las tarifas porque el producto describe
  // lo que se vende y el plan pone el precio.
  'src/database/migrations/20260826220000-catalogo-productos-facturables.sql',
] as const;

export interface LegacySqlProbe {
  filePath: string;
  sql: string;
}

// Bases creadas antes de existir public.atlas_sql_migrations: si el objeto sonda
// ya existe, el archivo se marca como aplicado sin re-ejecutarlo.
export const LEGACY_SQL_PROBES: LegacySqlProbe[] = [
  {
    filePath: 'src/database/sql/accounting/001_schema_atlas_accounting.sql',
    sql: "SELECT to_regclass('atlas_accounting.legal_entity') IS NOT NULL AS exists",
  },
  {
    filePath: 'src/database/sql/accounting/002_hardening_atlas_accounting.sql',
    sql: `
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_accounting_period_close_status'
          AND conrelid = 'atlas_accounting.accounting_period'::regclass
      ) AS exists
    `,
  },
  {
    filePath: 'src/database/migrations/20260708203000-create-atlas-ads-schema.sql',
    sql: "SELECT to_regclass('public.ad_advertiser_accounts') IS NOT NULL AS exists",
  },
  {
    filePath: 'src/database/migrations/20260709010000-create-business-action-logs.sql',
    sql: "SELECT to_regclass('atlas_audit.business_action_logs') IS NOT NULL AS exists",
  },
];
