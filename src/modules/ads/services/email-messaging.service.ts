import { enviarCorreoErp } from '../../../common/mail/erp-mail.transport';
import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { env } from '../../../config/env';
import { CampaignModel } from '../models/campaign.model';
import { EmailMessageModel } from '../models/email-message.model';
import { EmailSuppressionModel } from '../models/email-suppression.model';
import type { CreateEmailSuppressionDto, SendCampaignEmailDto } from '../email-messaging.schemas';

function render(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, path: string) => {
    let current: unknown = values;
    for (const key of path.split('.'))
      current =
        typeof current === 'object' && current !== null
          ? (current as Record<string, unknown>)[key]
          : undefined;
    return current === undefined || current === null ? '' : String(current);
  });
}

function trackingUuid(campaignId: string, key: string): string {
  const hex = createHash('sha256').update(`${campaignId}:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

@Injectable()
export class EmailMessagingService {
  constructor(
    @InjectModel(CampaignModel) private readonly campaigns: typeof CampaignModel,
    @InjectModel(EmailMessageModel) private readonly messages: typeof EmailMessageModel,
    @InjectModel(EmailSuppressionModel) private readonly suppressions: typeof EmailSuppressionModel,
  ) {}

  async enqueue(input: SendCampaignEmailDto, idempotencyKey: string) {
    const campaign = await this.campaigns.findByPk(input.campaignId);
    if (!campaign)
      throw new NotFoundException({ code: 'CAMPAIGN_NOT_FOUND', message: 'La campaña no existe.' });
    const trackingId = trackingUuid(input.campaignId, idempotencyKey);
    const existing = await this.messages.count({ where: { trackingId } });
    if (existing > 0) return this.tracking(trackingId);
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
    let suppressed = 0;
    const created: EmailMessageModel[] = [];
    for (const recipient of input.recipients) {
      const email = recipient.email.toLowerCase();
      if (await this.suppressions.findOne({ where: { emailNormalized: email, isActive: true } })) {
        suppressed += 1;
        continue;
      }
      const values = {
        ...input.variables,
        ...recipient.variables,
        recipient: { name: recipient.name ?? '', email },
      };
      created.push(
        await this.messages.create({
          trackingId,
          campaignId: input.campaignId,
          recipientEmail: email,
          recipientReference: recipient.referenceId ?? null,
          subject: render(input.subject, values),
          htmlBody: render(input.htmlBody, values),
          textBody: input.textBody ? render(input.textBody, values) : null,
          status: 'PENDING',
          scheduledAt,
          attemptCount: 0,
        }),
      );
    }
    if (scheduledAt.getTime() <= Date.now()) await this.processDue();
    return {
      trackingId,
      campaignId: input.campaignId,
      requested: input.recipients.length,
      queued: created.length,
      suppressed,
    };
  }

  async processDue(): Promise<number> {
    const due = await this.messages.findAll({
      where: { status: 'PENDING', scheduledAt: { [Op.lte]: new Date() } },
      limit: 100,
      order: [['scheduledAt', 'ASC']],
    });
    let processed = 0;
    for (const message of due) {
      const [claimed] = await this.messages.update(
        { status: 'PROCESSING' },
        { where: { id: message.id, status: 'PENDING' } },
      );
      if (claimed !== 1) continue;
      await this.deliver(message);
      processed += 1;
    }
    return processed;
  }

  private async deliver(message: EmailMessageModel): Promise<void> {
    try {
      // Mismo transporte que la factura (`erp-mail.transport.ts`): por defecto AtlasBackend lo manda
      // por la Gmail de ATLAS. En `mock` no sale nada y queda SIMULATED, sin `sentAt`: el
      // seguimiento no puede afirmar una entrega que no ocurrió.
      const enviado = await enviarCorreoErp({
        to: message.recipientEmail,
        subject: message.subject,
        text: message.textBody || textoPlano(message.htmlBody),
        html: message.htmlBody,
        reference: `ads:${message.id}`,
      });
      await message.update({
        status: enviado.status,
        providerMessageId:
          enviado.status === 'SIMULATED' ? `mock-${message.id}` : enviado.providerMessageId,
        sentAt: enviado.status === 'SENT' ? new Date() : null,
        attemptCount: message.attemptCount + 1,
        lastError: null,
      });
    } catch (error) {
      const attempts = message.attemptCount + 1;
      await message.update({
        status: attempts >= env.EMAIL_MAX_SEND_ATTEMPTS ? 'FAILED' : 'PENDING',
        attemptCount: attempts,
        scheduledAt: new Date(Date.now() + env.EMAIL_RETRY_DELAY_MS),
        lastError: error instanceof Error ? error.message : 'EMAIL_SEND_FAILED',
      });
    }
  }

  async tracking(trackingId: string) {
    const rows = await this.messages.findAll({
      where: { trackingId },
      order: [['created_at', 'ASC']],
    });
    if (!rows.length)
      throw new NotFoundException({
        code: 'EMAIL_TRACKING_NOT_FOUND',
        message: 'Tracking no encontrado.',
      });
    const byStatus = rows.reduce<Record<string, number>>(
      (acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }),
      {},
    );
    return {
      trackingId,
      campaignId: rows[0]!.campaignId,
      total: rows.length,
      byStatus,
      messages: rows.map((row) => ({
        id: row.id,
        recipientReference: row.recipientReference,
        status: row.status,
        attempts: row.attemptCount,
        sentAt: row.sentAt,
        error: row.lastError,
      })),
    };
  }

  async suppress(input: CreateEmailSuppressionDto) {
    const emailNormalized = input.email.toLowerCase();
    const [row] = await this.suppressions.findOrCreate({
      where: { emailNormalized },
      defaults: {
        emailNormalized,
        reason: input.reason,
        details: input.details ?? null,
        isActive: true,
      },
    });
    if (!row.isActive || row.reason !== input.reason)
      await row.update({ reason: input.reason, details: input.details ?? null, isActive: true });
    return {
      id: row.id,
      emailMasked: `***${emailNormalized.slice(-4)}`,
      reason: row.reason,
      isActive: row.isActive,
    };
  }

  async listSuppressions() {
    return (
      await this.suppressions.findAll({
        where: { isActive: true },
        order: [['created_at', 'DESC']],
      })
    ).map((row) => ({
      id: row.id,
      emailMasked: `***${row.emailNormalized.slice(-4)}`,
      reason: row.reason,
      details: row.details,
    }));
  }
}

/** Texto plano mínimo desde el HTML, para los clientes de correo que no pintan HTML. */
function textoPlano(html: string | null | undefined): string {
  return (
    (html ?? '')
      .replace(/<(br|\/p|\/div|\/h[1-6]|\/li)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim() || ' '
  );
}
