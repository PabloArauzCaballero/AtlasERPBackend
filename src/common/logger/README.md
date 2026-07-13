# Logger

## Responsabilidad

Centraliza el logging estructurado del módulo usando Pino.

## Archivos

- `logger.module.ts`: expone `PinoLoggerService` como provider global de NestJS.
- `pino-logger.service.ts`: configura Pino, redacted de datos sensibles y métodos `info`, `warn`, `error`, `debug`.

## Convenciones

- No usar `console.log`, `console.warn` ni `console.error` en código de aplicación.
- No registrar tokens, cookies, contraseñas ni headers sensibles.
- Todo log debe incluir contexto mínimo: capa, módulo, acción y entidad cuando aplique.
