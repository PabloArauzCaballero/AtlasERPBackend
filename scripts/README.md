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

## check-deploy.cjs

Ejecuta la verificación completa de despliegue con pasos aislados: type-check, lint, build, auditoría de casos de uso, auditoría de dependencias, unit tests y e2e. Usa binarios locales de `node_modules/.bin` para evitar diferencias entre entornos.

## check-deploy.sh

Script de verificación de compilación para entornos Linux/CI: ejecuta type-check, lint, limpieza de build y compilación TypeScript.
