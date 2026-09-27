# Facturación electrónica con el SIAT (SIN Bolivia)

Plan: `atlas/_plan-facturacion-siat-2026-09-26/PLAN.md`. Emulador del SIN: proveedor `siat` de
`AtlasExternalProvidersMock`.

## Un dominio fiscal, dos transportes

- `domain/` — puro, sin red ni base: `cuf.ts` (algoritmo del SIN, tres vectores oficiales en las
  pruebas), `montos.ts` (fórmulas del sector 1 sobre `decimal-amount.util`, importes CON IVA),
  `factura-xml.ts` (orden exacto del XSD, `xsi:nil` en opcionales), `paquete-tar.ts` (tar ustar +
  gzip, un XML por factura), `siat-codes.ts` (qué hace el ERP con cada código; lo desconocido es
  `ERROR` con alerta, nunca rechazo), `fecha-local.ts` (zona de `legal_entity.timezone`).
- `infrastructure/` — el puerto `SiatTransport`; `JsonMockSiatTransport` (emulador) y
  `SoapSiatTransport` (piloto/producción: F7, hoy responde `SIAT_SOAP_TRANSPORT_NOT_READY`).
- `application/` — `SiatGatewayService` (único punto de salida; bitácora sin cabeceras),
  credenciales CUIS/CUFD, catálogos, emisor, emisión, despacho (cola CAS), contingencia, anulación.

## Ciclo de un documento

`preparar` (fuera de la transacción: emisor, SIN, CUFD, en línea u OFFLINE) →
`emitirEnTransaccion` (número fiscal, CUF, XML, `QUEUED` u `OFFLINE`) → `FiscalDocumentProcessor`
(cada `SIAT_PROCESSOR_INTERVAL_MS`, dentro de la API) reclama con CAS y envía → `ACCEPTED` /
`OBSERVED` / `REJECTED`; un fallo tras enviar consulta el estado por CUF; agotada la ventana en línea
se regenera fuera de línea bajo un evento. Al volver el SIN: evento registrado, paquetes, validación.

El procesador vive en la API y no en `worker-outbox` porque ese worker es `pg` crudo sin Nest; con
varias instancias a la vez manda la reclamación CAS por fila, no la bandera en memoria.

## Pruebas

- `test/fiscal-siat-domain.spec.ts` — CUF, XSD (`xmllint`), montos, tar.
- `test/fiscal-siat-dispatch.spec.ts` — clasificación de respuestas y plazo de anulación.
- `test/fiscal-siat-mock.integration.spec.ts` y `test/fiscal-siat-emision.integration.spec.ts` —
  PostgreSQL real + el emulador real (`ERP_PROVIDERS_MOCK_DIR`, por defecto
  `../AtlasExternalProvidersMock`; con `ERP_REQUIRE_PROVIDERS_MOCK=1` su ausencia es un fallo).
