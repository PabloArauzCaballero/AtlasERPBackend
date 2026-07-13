# MailSender integrado en ATLAS Ads

La capacidad de MailSender vive dentro del módulo `ads`; no requiere levantar el servidor Express original.

## Endpoints

- `POST /api/v1/admin/ads/email/send` — encola hasta 500 destinatarios y requiere `X-Idempotency-Key`.
- `GET /api/v1/admin/ads/email/tracking/:trackingId` — estados e intentos por campaña.
- `POST /api/v1/admin/ads/email/suppressions` — unsubscribe, hard bounce, spam o bloqueo manual.
- `GET /api/v1/admin/ads/email/suppressions` — lista enmascarada.

El envío acepta `subject`, `htmlBody`, `textBody`, `scheduledAt`, variables globales y variables por destinatario. Cada solicitud referencia obligatoriamente un `campaignId` existente.

## Configuración

Para desarrollo:

```env
EMAIL_PROVIDER_MODE=mock
```

Para SendGrid:

```env
EMAIL_PROVIDER_MODE=sendgrid
SENDGRID_API_KEY=SG_...
EMAIL_FROM=correo-verificado@dominio.com
```

Antes de iniciar la API, ejecutar `yarn db:migrate:ads`. El worker embebido reclama atómicamente mensajes pendientes, procesa envíos programados y reintenta errores según `EMAIL_MAX_SEND_ATTEMPTS`.
