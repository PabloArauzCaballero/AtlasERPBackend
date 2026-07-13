# Decorators del módulo Ads

Contiene decorators específicos del módulo de publicidad.

## Archivos

### request-id.decorator.ts

Extrae el `requestId` normalizado por el middleware global de contexto para registrar auditoría y trazabilidad.

## Qué no debe ir aquí

- Decorators transversales usados por todos los módulos; esos pertenecen a `src/common/decorators`.
