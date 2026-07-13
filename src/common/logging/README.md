# Logging estructurado con Pino

Esta carpeta centraliza el logger de producción del módulo.

## Responsabilidad

- Crear un logger Pino único para toda la aplicación.
- Redactar tokens, cookies, contraseñas y campos sensibles.
- Exponer `PinoLoggerService` para controllers indirectos, guards, pipes, filters, interceptors, services y repositories.
- Mantener logs JSON aptos para Docker, plataformas cloud y agregadores externos.

## Convención

No se registran bodies completos, tokens, cookies ni contraseñas. Cada capa debe registrar eventos relevantes con identificadores técnicos, estados, duración y resultado, sin filtrar datos sensibles.

## Archivos

- `root-pino-logger.ts`: crea el logger raíz y define redacción de campos sensibles.
- `pino-logger.service.ts`: adapter NestJS y métodos explícitos por contexto.
- `pino-logger.module.ts`: módulo global para inyección.
