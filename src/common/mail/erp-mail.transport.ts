import { env } from '../../config/env';
import { signOutboxBody } from '../../workers/outbox/http-event-publisher';

export interface ErpMailAttachment {
  filename: string;
  contentType: 'application/pdf' | 'application/xml';
  content: Buffer;
}

export interface ErpMail {
  to: string;
  subject: string;
  text: string;
  html?: string | null | undefined;
  /** Identifica la operación (`siat:<doc>:EMISION`, `ads:<id>`): semilla MIME y rastro en los logs. */
  reference: string;
  attachments?: ErpMailAttachment[] | undefined;
}

/** SENT = lo aceptó el proveedor. SIMULATED = no salió hacia el destinatario (modo `mock`). */
export interface ErpMailOutcome {
  status: 'SENT' | 'SIMULATED';
  providerMessageId: string;
}

/** Ruta de AtlasBackend que acepta el correo del ERP firmado servicio a servicio. */
const ATLAS_ERP_MAIL_PATH = 'internal/integration/erp/mail';

/**
 * Transporte ÚNICO del correo que sale del ERP sin una persona detrás (factura fiscal, avisos de
 * anuncios). La propuesta comercial, que la manda una persona, va con su sesión (ver
 * `proposal-delivery.service.ts`).
 *
 * `EMAIL_PROVIDER_MODE` (resuelto en `env.ts`):
 * - `atlas` → AtlasBackend lo envía por la Gmail API de ATLAS. Va firmado con el MISMO secreto que el
 *   outbox (`OUTBOX_DELIVERY_SIGNING_SECRET`), porque quien envía es un worker sin sesión. Es el valor
 *   por defecto cuando ese secreto existe: el ERP no tiene proveedor propio y SendGrid no está
 *   contratado, así que hasta el 2026-10-01 las facturas «salían» sin llegar a nadie.
 * - `sendgrid` → SendGrid directo, por compatibilidad.
 * - `mock` → no sale nada; si hay emulador del SIN, se deja en su buzón QA (sin adjuntos).
 *
 * Lanza si el proveedor rechaza: quien llama decide si reintenta o lo da por fallido.
 */
export async function enviarCorreoErp(
  mail: ErpMail,
  options: { mockInboxBaseUrl?: string | null | undefined } = {},
): Promise<ErpMailOutcome> {
  if (env.EMAIL_PROVIDER_MODE === 'atlas') return porAtlas(mail);
  if (env.EMAIL_PROVIDER_MODE === 'sendgrid') return porSendgrid(mail);
  const buzon = options.mockInboxBaseUrl ?? null;
  if (buzon) {
    const adjuntos = (mail.attachments ?? []).map(
      (a) => `${a.filename} (${a.content.length} bytes)`,
    );
    const response = await fetch(new URL('/mock/inbox/email', buzon), {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: mail.to,
        subject: mail.subject,
        body: `${mail.text}${adjuntos.length ? `\n\nAdjuntos: ${adjuntos.join(', ')}` : ''}`,
      }),
    });
    if (!response.ok) throw new Error(`BUZON_MOCK_${response.status}`);
    return { status: 'SIMULATED', providerMessageId: `mock-inbox-${Date.now()}` };
  }
  return { status: 'SIMULATED', providerMessageId: `mock-${Date.now()}` };
}

async function porAtlas(mail: ErpMail): Promise<ErpMailOutcome> {
  const secreto = env.OUTBOX_DELIVERY_SIGNING_SECRET;
  if (!secreto) throw new Error('ATLAS_MAIL_SIGNING_SECRET_MISSING');
  const cuerpo = JSON.stringify({
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    ...(mail.html ? { html: mail.html } : {}),
    reference: mail.reference.slice(0, 120),
    attachments: (mail.attachments ?? []).map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      contentBase64: a.content.toString('base64'),
    })),
  });
  const response = await fetch(
    `${env.ATLAS_IDENTITY_BASE_URL.replace(/\/+$/, '')}/${ATLAS_ERP_MAIL_PATH}`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'content-type': 'application/json',
        'x-atlas-signature': signOutboxBody(secreto, cuerpo, Math.floor(Date.now() / 1000)),
      },
      body: cuerpo,
    },
  );
  if (!response.ok) {
    const detalle = (await response.json().catch(() => null)) as {
      error?: { code?: string };
    } | null;
    throw new Error(
      `ATLAS_MAIL_${response.status}${detalle?.error?.code ? `_${detalle.error.code}` : ''}`,
    );
  }
  const json = (await response.json().catch(() => ({}))) as {
    data?: { messageId?: string | null };
    messageId?: string | null;
  };
  return { status: 'SENT', providerMessageId: json.data?.messageId ?? json.messageId ?? 'atlas' };
}

async function porSendgrid(mail: ErpMail): Promise<ErpMailOutcome> {
  if (!env.SENDGRID_API_KEY || !env.EMAIL_FROM) throw new Error('SENDGRID_CONFIGURATION_MISSING');
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
    headers: {
      authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: mail.to }] }],
      from: { email: env.EMAIL_FROM },
      subject: mail.subject,
      content: [
        { type: 'text/plain', value: mail.text },
        ...(mail.html ? [{ type: 'text/html', value: mail.html }] : []),
      ],
      ...(mail.attachments?.length
        ? {
            attachments: mail.attachments.map((a) => ({
              content: a.content.toString('base64'),
              filename: a.filename,
              type: a.contentType,
              disposition: 'attachment',
            })),
          }
        : {}),
    }),
  });
  if (!response.ok) throw new Error(`SENDGRID_${response.status}`);
  return { status: 'SENT', providerMessageId: response.headers.get('x-message-id') ?? 'sendgrid' };
}
