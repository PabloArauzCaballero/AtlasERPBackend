# Scripts

Contiene scripts operativos ejecutables fuera del ciclo HTTP de NestJS.

## Archivos

- `run-sql-migration.ts`: aplica archivos SQL versionados contra PostgreSQL usando Sequelize y logs estructurados con Pino.
- `smoke/`: contiene pruebas smoke manuales contra la API desplegada.

## Convenciones

- No registrar secretos, cadenas de conexión completas, tokens ni payloads sensibles.
- Validar variables de entorno antes de ejecutar operaciones contra infraestructura.
- Mantener los scripts idempotentes cuando el SQL o el flujo lo permita.

## clean-build-state.cjs

Elimina `dist` y archivos `*.tsbuildinfo` antes de compilar. Esto evita bloqueos intermitentes cuando `type-check`, `lint` y `build` se ejecutan en cadena dentro de scripts de CI/CD.

## check-env-example.cjs

`yarn check:env-example`: falla si una variable del esquema de `src/config/env.ts` no aparece
nombrada (con o sin valor, comentada o no) en `.env.example`. Sin dependencias; corre en CI.

## Verificación de despliegue

`yarn check:deploy` (`run-many.cjs`: type-check, lint, format:check, test, test:e2e y build). Los
antiguos `check-deploy.cjs` y `check-deploy.sh` se retiraron el 2026-09-29: ningún script ni flujo
los llamaba y el primero ejecutaba `npm audit`, que no es la auditoría del repositorio
(`yarn audit:dependencies`).
