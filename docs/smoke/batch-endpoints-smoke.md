# Smoke tests para endpoints batch/bulk

## Script agregado

```bash
npm run smoke:batch
```

## Endpoints cubiertos

| Endpoint                                  | Estrategia                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/b2b/accounts/bulk`          | Envía batch con duplicado interno y espera `400`, probando ruta + guard + pipe Zod sin crear registros. |
| `POST /api/v1/accounting/documents/bulk`  | Envía documentos duplicados dentro del batch y espera `400`, sin tocar persistencia.                    |
| `POST /api/v1/admin/ads/advertisers/bulk` | Envía anunciantes duplicados por país/NIT y espera `400`.                                               |
| `POST /api/v1/ads/events/bulk`            | Envía `items: []` y espera `400` por validación de tamaño mínimo.                                       |

## Por qué se usa validación-only

Los smoke tests deben confirmar que los endpoints batch están vivos, protegidos y conectados a validación sin generar datos productivos por accidente. Por eso se usan payloads deliberadamente inválidos a nivel de regla Zod, no payloads que lleguen a escritura.

## Variables útiles

```bash
API_BASE_URL=http://localhost:3000/api/v1
JWT_ACCESS_SECRET=change_me_long_random_secret_32_chars_min
ATLAS_BATCH_SMOKE_TOKEN=<token-opcional>
SMOKE_BATCH_REPORT_PATH=scripts/smoke/batch-endpoints.smoke.result.json
```

Si `ATLAS_BATCH_SMOKE_TOKEN` no se define, el script firma un token local con roles suficientes usando `JWT_ACCESS_SECRET`.
