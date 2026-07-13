# Aplicación del patch de seeds

Copie el contenido del ZIP sobre la raíz de `atlas-integrated-backend`, conservando la estructura.

## Ejecución

```bash
npm run db:migrate
ALLOW_DEMO_SEEDS=true npm run db:seed
```

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
