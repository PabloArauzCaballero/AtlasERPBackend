# Smoke tests

Contiene pruebas smoke mínimas para validar que el API responde después de levantar el servidor y aplicar migraciones.

## Archivos

- `b2b-sales-crm.smoke.ts`: valida health, readiness y consulta paginada de cuentas B2B usando JWT Bearer de prueba.
- `portal.smoke.ts`: valida que el portal del comercio sea fail-closed y que un identificador de
  otro comercio responda 403. Sin `ATLAS_PORTAL_SMOKE_TOKEN` solo comprueba que todo `/portal/*`
  responda 401/403; los casos de alcance cruzado se omiten (y se reportan como omitidos) si no se
  proveen `ATLAS_PORTAL_SMOKE_FOREIGN_ACCOUNT_ID`, `..._ADVERTISER_ID` o `..._CAMPAIGN_ID`.

## Convenciones

- Usar Pino para logs estructurados.
- No imprimir tokens ni headers sensibles.
- Fallar con código distinto de cero cuando un endpoint crítico no responde correctamente.
