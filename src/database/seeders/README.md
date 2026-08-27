# Seeders de base de datos

## Responsabilidad

Contiene datos base de dominio y un seed de cobertura para ambientes locales o de QA.

## Flujo recomendado

```bash
npm run db:migrate
ALLOW_DEMO_SEEDS=true npm run db:seed
```

El comando ejecuta primero los seeds explícitos de CRM, Contabilidad y Ads. Después, `scripts/db/seed-all-tables.ts` inspecciona PostgreSQL y agrega un registro mínimo únicamente en tablas vacías.

## Seguridad

- No trunca ni elimina registros.
- No se ejecuta con `NODE_ENV=production`.
- Requiere `ALLOW_DEMO_SEEDS=true`.
- Toda la cobertura se ejecuta en una transacción. Si una tabla no puede poblarse, se revierte el bloque completo y se reporta la causa.
- Los datos usan dominios `.local` y no representan personas o empresas reales.

## Archivos

- `001_reference_chart_of_accounts.sql`: plan de cuentas e impuestos base.
- `20260708191000-seed-atlas-b2b-sales-crm.sql`: usuarios internos y territorios base.
- `20260708204000-seed-atlas-ads-defaults.sql`: placements y políticas publicitarias.
- `20260826221000-seed-billing-products.sql`: los tres productos que Atlas factura al comercio
  (alcance, clics y comisión MDR). Es dato maestro, no fixture: sin él la factura del partner
  vuelve a ser texto libre, así que también se siembra en producción.
- `scripts/db/seed-all-tables.ts`: cobertura de tablas vacías, respetando defaults, enums, checks y claves foráneas.

## Qué no debe colocarse aquí

- Credenciales reales.
- Datos personales reales.
- Seeds destructivos.
- Cambios estructurales de base de datos; esos pertenecen a migraciones.
