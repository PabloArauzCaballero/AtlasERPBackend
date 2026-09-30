import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Op } from 'sequelize';
import { env } from '../../../config/env';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import type { AuthUser } from '../../../common/types/auth-context.types';
import type { SendProposalDto } from '../b2b-sales-crm.dtos';
import { ApprovalStatus, ProposalStatus } from '../b2b-sales-crm.enums';
import { toProposalResponse } from '../b2b-sales-crm.mapper';
import type { CommercialProposalModel } from '../models/b2b-sales-crm.models';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import { BusinessActionLogsService } from '../../business-action-logs/business-action-logs.service';
import type { GeneratedPdf } from '../../documents/documents.service';
import { importe, ProposalPdfService } from './proposal-pdf.service';

/** SENT = lo aceptó el proveedor. SIMULATED = no salió nada (sin proveedor). FAILED = el proveedor lo rechazó. */
export type ProposalDeliveryStatus = 'SENT' | 'SIMULATED' | 'FAILED';

export interface ProposalDeliveryResult {
  email: string;
  contactName: string | null;
  status: ProposalDeliveryStatus;
  error: string | null;
}

/** Estados desde los que se puede (re)enviar: una aceptada o rechazada ya no se ofrece. */
const ENVIABLES = new Set<string>([ProposalStatus.DRAFT, ProposalStatus.SENT, 'APPROVED']);

/**
 * Envío REAL de la propuesta comercial a las personas del comercio que elige el comercial.
 *
 * Hasta el 2026-09-30 «Enviar al cliente» sólo ponía `status = SENT` y la fecha: el comercio nunca
 * recibía nada y la pantalla no preguntaba a quién. Ahora:
 * - los destinatarios son contactos ACTIVOS de la cuenta (con correo) más, si hace falta, correos
 *   sueltos que teclea el comercial;
 * - cada destinatario tiene su desenlace (`SENT`, `SIMULATED`, `FAILED`) y la respuesta los trae
 *   todos, para que la pantalla diga la verdad;
 * - la propuesta sólo pasa a `SENT` si al menos un correo salió o quedó simulado; si el proveedor
 *   rechaza todos, no cambia nada y responde 502.
 *
 * `SIMULATED` es el caso de `EMAIL_PROVIDER_MODE=mock`: no llega nada al comercio. Se deja avanzar la
 * propuesta para poder probar el ciclo en TEST, pero la respuesta lo dice con todas las letras.
 */
@Injectable()
export class ProposalDeliveryService {
  constructor(
    private readonly repository: B2BSalesCrmRepository,
    private readonly businessActionLogs: BusinessActionLogsService,
    private readonly logger: PinoLoggerService,
    private readonly proposalPdf: ProposalPdfService,
  ) {}

  /** Contactos activos de la cuenta de la propuesta que tienen correo: los candidatos del envío. */
  async recipients(proposalId: string): Promise<Record<string, unknown>[]> {
    const proposal = await this.requireProposal(proposalId);
    const contacts = await this.repository.contacts.findAll({
      where: { accountId: proposal.accountId, status: 'ACTIVE', email: { [Op.ne]: null } },
      order: [
        ['isPrimary', 'DESC'],
        ['fullName', 'ASC'],
      ],
    });
    return contacts
      .filter((contact) => CORREO.test(String(contact.email ?? '')))
      .map((contact) => ({
        id: contact.id,
        fullName: contact.fullName,
        roleTitle: contact.roleTitle,
        email: contact.email,
        isPrimary: contact.isPrimary,
      }));
  }

  async send(
    proposalId: string,
    input: SendProposalDto,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    const proposal = await this.repository.findProposalWithLines(proposalId);
    if (!proposal) throw new NotFoundException('Propuesta no encontrada.');
    if (!ENVIABLES.has(proposal.status)) {
      throw new ConflictException('Solo se envía una propuesta en borrador o ya enviada.');
    }
    const pendingApproval = await this.repository.approvalRequests.findOne({
      where: { proposalId, status: ApprovalStatus.PENDING },
    });
    if (pendingApproval) {
      throw new ConflictException(
        'La propuesta tiene aprobaciones pendientes y no puede enviarse.',
      );
    }

    const destinatarios = await this.resolveRecipients(proposal.accountId, input);
    const account = await this.repository.accounts.findByPk(proposal.accountId);
    const mensaje = componer(
      proposal,
      account?.tradeName ?? account?.legalName ?? null,
      input.message ?? null,
    );
    // El documento con membrete va adjunto. Si el generador no está, el correo sale igual (con
    // las condiciones en el cuerpo) y la respuesta lo dice: una propuesta no se queda sin enviar
    // porque falle el PDF, pero nadie puede creer que lo llevaba.
    let pdfError: string | null = null;
    try {
      mensaje.adjunto = await this.proposalPdf.pdf(proposal, account, input.message ?? null);
    } catch (error) {
      pdfError = error instanceof Error ? error.message : String(error);
      this.logger.warn('La propuesta se envía sin PDF: el generador documental falló.', {
        layer: 'service',
        module: 'b2b-sales-crm',
        proposalId,
        error: pdfError,
      });
    }

    const deliveries: ProposalDeliveryResult[] = [];
    for (const destinatario of destinatarios) {
      try {
        const status = await transportar(destinatario.email, mensaje);
        deliveries.push({ ...destinatario, status, error: null });
      } catch (error) {
        const detalle = error instanceof Error ? error.message : String(error);
        this.logger.warn('No se pudo enviar la propuesta a un destinatario.', {
          layer: 'service',
          module: 'b2b-sales-crm',
          proposalId,
          error: detalle,
        });
        deliveries.push({ ...destinatario, status: 'FAILED', error: detalle });
      }
    }

    if (deliveries.every((delivery) => delivery.status === 'FAILED')) {
      throw new BadGatewayException({
        message: 'El proveedor de correo rechazó todos los envíos; la propuesta sigue sin enviar.',
        deliveries,
      });
    }

    await proposal.update({ status: ProposalStatus.SENT, sentAt: new Date() });
    await this.businessActionLogs.record({
      moduleCode: 'CRM',
      businessProcess: 'SALES_PIPELINE',
      actionCode: 'SEND_PROPOSAL',
      actorUserId: user.sub,
      actorRole: user.role ?? null,
      aggregateType: 'PROPOSAL',
      aggregateId: proposal.id,
      affectedTables: ['atlas_sales.commercial_proposals'],
      affectedRecordCount: 1,
      status: 'SUCCESS',
      inputSummary: { deliveries: deliveries.map(({ email, status }) => ({ email, status })) },
    });
    return {
      ...toProposalResponse(proposal),
      deliveries,
      pdf: { attached: Boolean(mensaje.adjunto), error: pdfError },
    };
  }

  private async requireProposal(proposalId: string): Promise<CommercialProposalModel> {
    const proposal = await this.repository.proposals.findByPk(proposalId);
    if (!proposal) throw new NotFoundException('Propuesta no encontrada.');
    return proposal;
  }

  /** Contactos elegidos (que deben ser de ESTA cuenta y tener correo) + correos sueltos, sin repetir. */
  private async resolveRecipients(
    accountId: string,
    input: SendProposalDto,
  ): Promise<Array<{ email: string; contactName: string | null }>> {
    const porCorreo = new Map<string, { email: string; contactName: string | null }>();
    if (input.contactIds.length > 0) {
      const contacts = await this.repository.contacts.findAll({
        where: { id: { [Op.in]: input.contactIds }, accountId },
      });
      if (contacts.length !== new Set(input.contactIds).size) {
        throw new BadRequestException('Algún contacto elegido no pertenece a este comercio.');
      }
      for (const contact of contacts) {
        const email = String(contact.email ?? '')
          .trim()
          .toLowerCase();
        if (!CORREO.test(email)) {
          throw new BadRequestException(`${contact.fullName} no tiene un correo válido.`);
        }
        porCorreo.set(email, { email, contactName: contact.fullName });
      }
    }
    for (const suelto of input.extraEmails) {
      const email = suelto.trim().toLowerCase();
      if (!porCorreo.has(email)) porCorreo.set(email, { email, contactName: null });
    }
    if (porCorreo.size === 0) throw new BadRequestException('Elige al menos un destinatario.');
    return [...porCorreo.values()];
  }
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface MensajePropuesta {
  asunto: string;
  cuerpo: string;
  adjunto?: GeneratedPdf;
}

function componer(
  proposal: CommercialProposalModel,
  comercio: string | null,
  nota: string | null,
): MensajePropuesta {
  const condiciones = (proposal.lines ?? []).map((line) => {
    const tasa =
      line.ratePercent !== null && line.ratePercent !== undefined ? `${line.ratePercent} %` : null;
    const fijo =
      line.fixedAmount !== null && line.fixedAmount !== undefined
        ? importe(line.fixedAmount, line.currency)
        : null;
    return `  • ${line.description}: ${[tasa, fijo].filter(Boolean).join(' + ') || '—'}`;
  });
  const cuerpo = [
    `Estimados${comercio ? ` de ${comercio}` : ''}:`,
    '',
    `Les hacemos llegar la propuesta comercial ${proposal.proposalNumber} de ATLAS.`,
    nota ? `\n${nota}\n` : '',
    'Condiciones:',
    ...(condiciones.length > 0 ? condiciones : ['  • Sin condiciones detalladas.']),
    '',
    `Ingreso mensual estimado: ${importe(proposal.totalEstimatedMonthlyRevenue)}`,
    `Válida hasta: ${proposal.validUntil ?? 'sin fecha límite'}`,
    '',
    'Adjuntamos la propuesta completa en PDF.',
    'Para aceptarla o hacernos cualquier consulta, respondan a este correo.',
    '',
    'Equipo comercial de ATLAS',
  ].join('\n');
  return { asunto: `Propuesta comercial ${proposal.proposalNumber} — ATLAS`, cuerpo };
}

/**
 * Mismo transporte que la factura fiscal (`fiscal-mail.service.ts`): SendGrid si está configurado;
 * si no, el buzón QA del emulador (`/mock/inbox/email`), y si tampoco, nada. Sólo SendGrid es `SENT`.
 */
async function transportar(
  destinatario: string,
  mensaje: MensajePropuesta,
): Promise<ProposalDeliveryStatus> {
  if (env.EMAIL_PROVIDER_MODE === 'sendgrid') {
    if (!env.SENDGRID_API_KEY || !env.EMAIL_FROM) throw new Error('SENDGRID_CONFIGURATION_MISSING');
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: {
        authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: destinatario }] }],
        from: { email: env.EMAIL_FROM },
        subject: mensaje.asunto,
        content: [{ type: 'text/plain', value: mensaje.cuerpo }],
        ...(mensaje.adjunto
          ? {
              attachments: [
                {
                  content: mensaje.adjunto.buffer.toString('base64'),
                  filename: mensaje.adjunto.filename,
                  type: 'application/pdf',
                  disposition: 'attachment',
                },
              ],
            }
          : {}),
      }),
    });
    if (!response.ok) throw new Error(`SENDGRID_${response.status}`);
    return 'SENT';
  }
  if (env.SIAT_MOCK_BASE_URL) {
    const response = await fetch(new URL('/mock/inbox/email', env.SIAT_MOCK_BASE_URL), {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json' },
      // El buzón del emulador no admite adjuntos: se deja constancia del PDF en el cuerpo.
      body: JSON.stringify({
        to: destinatario,
        subject: mensaje.asunto,
        body: mensaje.adjunto
          ? `${mensaje.cuerpo}\n\nAdjunto: ${mensaje.adjunto.filename} (${mensaje.adjunto.buffer.length} bytes)`
          : mensaje.cuerpo,
      }),
    });
    if (!response.ok) throw new Error(`BUZON_MOCK_${response.status}`);
  }
  return 'SIMULATED';
}
