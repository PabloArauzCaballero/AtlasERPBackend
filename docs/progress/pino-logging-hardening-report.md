# Auditoría de logging y endurecimiento Pino

## 1. Objetivo del ciclo

Se revisó nuevamente el módulo con foco en funcionalidad de corto y largo plazo, mantenibilidad y observabilidad. La corrección principal fue incorporar logging estructurado con Pino en las capas críticas del código sin exponer datos sensibles.

## 2. Cambios implementados

- Se agregó dependencia de producción `pino`.
- Se creó `src/common/logging/root-pino-logger.ts` con logger raíz, nivel configurable y redacción de secretos.
- Se creó `src/common/logging/pino-logger.service.ts` como adapter compatible con NestJS `LoggerService`.
- Se creó `src/common/logging/pino-logger.module.ts` como módulo global.
- Se agregó `LOG_LEVEL` a `src/config/env.ts` y `.env.example`.
- Se configuró `app.useLogger(logger)` en `src/main.ts`.
- Se agregó `LoggingInterceptor` global para registrar request, response, duración, estado y `X-Request-Id`.
- Se modificó `HttpExceptionFilter` para registrar errores 5xx/infrastructura con Pino.
- Se modificó `JwtAuthGuard` para registrar aceptación/rechazo de JWT sin registrar tokens.
- Se modificó `RolesGuard` para registrar autorización aceptada/denegada.
- Se modificó `ZodValidationPipe` para registrar rechazos de validación sin registrar bodies completos.
- Se modificó `HealthService` para registrar health/readiness.
- Se modificó `B2BSalesCrmService` para registrar inicio de cada caso de uso de negocio.
- Se modificó `B2BSalesCrmRepository` para registrar transacciones, auditoría y consultas relevantes.
- Se modificó `DatabaseModule` para enviar SQL de Sequelize a Pino solo en desarrollo.
- Se agregó `test/set-env.ts` para evitar que tests unit/e2e dependan de variables reales del entorno.
- Se actualizó documentación de arquitectura, README y README de `common`.

## 3. Cobertura por capa

| Capa                | Archivo principal                                                    | Logging aplicado                                |
| ------------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| Bootstrap           | `src/main.ts`                                                        | Inicio del proceso y puerto/prefijo             |
| HTTP/controller     | `src/common/interceptors/logging.interceptor.ts`                     | Request, response, duración, status, request id |
| Autenticación       | `src/common/guards/jwt-auth.guard.ts`                                | JWT aceptado/rechazado sin token                |
| Autorización        | `src/common/guards/roles.guard.ts`                                   | Rol aceptado/denegado                           |
| Validación          | `src/common/pipes/zod-validation.pipe.ts`                            | Campos inválidos y cantidad de errores          |
| Errores             | `src/common/filters/http-exception.filter.ts`                        | Errores 5xx y errores de infraestructura        |
| Servicio de negocio | `src/modules/b2b-sales-crm/services/b2b-sales-crm.service.ts`        | Inicio de cada caso de uso                      |
| Persistencia        | `src/modules/b2b-sales-crm/repositories/b2b-sales-crm.repository.ts` | Transacciones, auditoría, búsquedas relevantes  |
| Base de datos       | `src/database/sequelize.module.ts`                                   | SQL solo en desarrollo                          |
| Health              | `src/modules/health/health.service.ts`                               | Health/readiness y duración                     |

## 4. Decisiones de seguridad

No se implementó logging de cada línea de código ni logging de cuerpos completos. Eso sería peligroso en producción porque podría filtrar tokens, cookies, contraseñas, datos financieros o información personal. En su lugar, se instrumentaron capas y eventos relevantes con datos mínimos, trazables y seguros.

Pino redacted paths:

- `Authorization`
- `Cookie`
- `password`
- `passwordHash`
- `accessToken`
- `refreshToken`
- `token`

## 5. Riesgos de largo plazo mitigados

| Riesgo                                            | Mitigación aplicada                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| Incidentes difíciles de rastrear                  | `X-Request-Id` global y logs por request                            |
| Errores 500 sin diagnóstico                       | `HttpExceptionFilter` registra errores internos con Pino            |
| Falta de visibilidad en transacciones financieras | Repository registra inicio/commit/rollback transaccional            |
| Logs inseguros con credenciales                   | Redacción centralizada y prohibición documental de bodies completos |
| Tests dependientes de entorno real                | `test/set-env.ts` con variables controladas de test                 |
| SQL ruidoso o sensible en producción              | SQL logs solo en `development`                                      |

## 6. Checks ejecutados

Los logs completos están en `docs/progress/checks/`:

```bash
npm run type-check
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e
npm audit --omit=dev
npx prettier --check .
```

Todos los checks pasaron.

## 7. Estado del entregable

El módulo queda funcional y más operable a corto y largo plazo. La observabilidad ya no depende de `console.log` ni de logs improvisados; queda centralizada, segura y auditable con Pino.
