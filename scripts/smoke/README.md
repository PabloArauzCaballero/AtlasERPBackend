# Smoke tests

Contiene pruebas smoke mínimas para validar que el API responde después de levantar el servidor y aplicar migraciones.

## Archivos

- `b2b-sales-crm.smoke.ts`: valida health, readiness y consulta paginada de cuentas B2B usando JWT Bearer de prueba.

## Convenciones

- Usar Pino para logs estructurados.
- No imprimir tokens ni headers sensibles.
- Fallar con código distinto de cero cuando un endpoint crítico no responde correctamente.
