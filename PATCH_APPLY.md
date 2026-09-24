# Aplicación del patch de seeds

Copie el contenido del ZIP sobre la raíz de `atlas-integrated-backend`, conservando la estructura.

## Ejecución

```bash
npm run db:migrate
npm run db:seed:pull
```

> Corregido el 2026-09-24: `db:seed` ya no existe. Las semillas se traen de la base publicada con
> `db:seed:pull` (ver `docs/base-de-datos/semillas.md`); `scripts/db/seed-all-tables.ts` sigue exigiendo
> `ALLOW_DEMO_SEEDS=true` y no tiene guion en `package.json`.

El proceso ejecuta los seeds explícitos existentes y después completa todas las tablas vacías de los esquemas administrados.

## Validación

```bash
npm run type-check
npm run lint
npm test
npm run build
```

## Restricción

El seed de cobertura se bloquea con `NODE_ENV=production` y exige `ALLOW_DEMO_SEEDS=true`.
