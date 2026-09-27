import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { gunzipSync } from 'node:zlib';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { env } from '../../../../config/env';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { ElectronicTaxDocumentModel, SiatEmailDeliveryModel } from '../../../../database/models';
import { FiscalPdfService } from './fiscal-pdf.service';
import { SiatGatewayService } from './siat-gateway.service';

export type TipoCorreoFiscal = 'EMISION' | 'ANULACION';

const LOTE = 20;
const MAX_INTENTOS = 5;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Adjunto {
  nombre: string;
  tipo: string;
  contenido: Buffer;
}

/**
 * Entrega al comprador de su factura fiscal (PDF + XML, requisito del SIN) y el aviso de anulación
 * (plan SIAT, D-8). Una fila por documento y tipo en `siat_email_delivery`: encolar dos veces no
 * manda dos correos, y el envío nunca sale desde la transacción de la factura ni desde el SIN.
 *
 * Transporte:
 * - `EMAIL_PROVIDER_MODE=sendgrid` → SendGrid, con los dos adjuntos.
 * - Con el emulador del SIN (`mock_server`) → el buzón QA del mock (`/mock/inbox/email`), que no
 *   admite adjuntos: el cuerpo lleva el N° fiscal, el CUF y el SHA-256 del XML para contrastarlo.
 * - Si no, se registra como enviado de prueba (`mock-…`), igual que el correo de campañas.
 */
@Injectable()
export class FiscalMailService {
  constructor(
    @InjectModel(SiatEmailDeliveryModel)
    private readonly deliveryModel: typeof SiatEmailDeliveryModel,
    @InjectModel(ElectronicTaxDocumentModel)
    private readonly documentModel: typeof ElectronicTaxDocumentModel,
    private readonly fiscalPdf: FiscalPdfService,
    private readonly gateway: SiatGatewayService,
    private readonly sequelize: Sequelize,
    private readonly logger: PinoLoggerService,
  ) {}

  /** Idempotente: sin correo del comprador no hay nada que encolar. */
  async encolar(
    documento: ElectronicTaxDocumentModel,
    tipo: TipoCorreoFiscal,
    transaction?: Transaction,
  ): Promise<void> {
    const correo = String(
      (documento.receptorSnapshot as { correo?: unknown } | null)?.correo ?? '',
    ).trim();
    if (!CORREO.test(correo)) return;
    await this.sequelize.query(
      `INSERT INTO atlas_accounting.siat_email_delivery (document_id, kind, recipient)
       VALUES ($1, $2, $3)
       ON CONFLICT (document_id, kind) DO NOTHING`,
      { bind: [documento.id, tipo, correo.toLowerCase()], transaction },
    );
  }

  async procesar(): Promise<number> {
    const ids = await this.sequelize.transaction(async (transaction) => {
      const filas = await this.sequelize.query<{ id: string }>(
        `SELECT id FROM atlas_accounting.siat_email_delivery
          WHERE status = 'PENDING' AND scheduled_at <= now()
          ORDER BY scheduled_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
        { bind: [LOTE], type: QueryTypes.SELECT, transaction },
      );
      if (filas.length === 0) return [];
      const reclamadas = await this.sequelize.query<{ id: string }>(
        `UPDATE atlas_accounting.siat_email_delivery
            SET status = 'PROCESSING', attempt_count = attempt_count + 1
          WHERE id = ANY($1::uuid[]) AND status = 'PENDING' RETURNING id`,
        { bind: [filas.map((f) => f.id)], type: QueryTypes.SELECT, transaction },
      );
      return reclamadas.map((f) => f.id);
    });
    for (const id of ids) await this.enviar(id);
    return ids.length;
  }

  private async enviar(id: string): Promise<void> {
    const entrega = await this.deliveryModel.findByPk(id);
    const documento = entrega ? await this.documentModel.findByPk(entrega.documentId) : null;
    if (!entrega || !documento) return;
    try {
      const mensaje = await this.componer(documento, entrega.kind as TipoCorreoFiscal);
      const providerMessageId = await this.transportar(entrega.recipient, mensaje);
      await entrega.update({
        status: 'SENT',
        sentAt: new Date(),
        providerMessageId,
        lastError: null,
      });
    } catch (error) {
      const agotado = entrega.attemptCount >= MAX_INTENTOS;
      await entrega.update({
        status: agotado ? 'FAILED' : 'PENDING',
        lastError: error instanceof Error ? error.message : String(error),
        scheduledAt: new Date(Date.now() + Math.min(2 ** entrega.attemptCount * 30_000, 3_600_000)),
      });
      if (agotado) {
        this.logger.warn('No se pudo entregar la factura fiscal al comprador.', {
          layer: 'service',
          module: 'fiscal-siat',
          alert: 'SIAT_EMAIL_FAILED',
          deliveryId: entrega.id,
          documentId: documento.id,
        });
      }
    }
  }

  private async componer(documento: ElectronicTaxDocumentModel, tipo: TipoCorreoFiscal) {
    const receptor = (documento.receptorSnapshot ?? {}) as { nombreRazonSocial?: string };
    const numero = documento.numeroFactura ?? '—';
    const adjuntos: Adjunto[] = [];
    let avisoPdf = '';
    if (tipo === 'EMISION') {
      if (documento.xmlGzip) {
        adjuntos.push({
          nombre: `factura-${numero}.xml`,
          tipo: 'application/xml',
          contenido: gunzipSync(documento.xmlGzip),
        });
      }
      try {
        const pdf = await this.fiscalPdf.pdf(documento);
        adjuntos.push({ nombre: pdf.filename, tipo: 'application/pdf', contenido: pdf.buffer });
      } catch {
        // Sin generador de PDF el XML es la factura; la representación gráfica se pide después.
        avisoPdf = '\nLa representación gráfica (PDF) se la enviaremos en cuanto esté disponible.';
      }
    }
    const asunto =
      tipo === 'EMISION'
        ? `Su factura N° ${numero}`
        : `Factura N° ${numero} anulada ante Impuestos Nacionales`;
    const cuerpo = [
      `Estimado/a ${receptor.nombreRazonSocial ?? 'cliente'}:`,
      '',
      tipo === 'EMISION'
        ? `Le enviamos su factura N° ${numero} por Bs ${documento.montoTotal ?? '—'}.${
            documento.siatStatus === 'OFFLINE' || documento.contingencyFlag
              ? ' Fue emitida fuera de línea durante una contingencia; es válida y se registrará ante Impuestos Nacionales al restablecerse la conexión.'
              : ''
          }${avisoPdf}`
        : `Le informamos que la factura N° ${numero} por Bs ${documento.montoTotal ?? '—'} fue anulada ante Impuestos Nacionales y ya no es válida.`,
      '',
      `Código Único de Factura (CUF): ${documento.cuf ?? '—'}`,
      tipo === 'EMISION' ? `Huella SHA-256 del XML (gzip): ${documento.xmlSha256 ?? '—'}` : '',
    ]
      .filter((linea, i, todas) => linea !== '' || todas[i - 1] !== '')
      .join('\n');
    return { asunto, cuerpo, adjuntos };
  }

  private async transportar(
    destinatario: string,
    mensaje: { asunto: string; cuerpo: string; adjuntos: Adjunto[] },
  ): Promise<string> {
    if (env.EMAIL_PROVIDER_MODE === 'sendgrid') {
      if (!env.SENDGRID_API_KEY || !env.EMAIL_FROM)
        throw new Error('SENDGRID_CONFIGURATION_MISSING');
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
          attachments: mensaje.adjuntos.map((a) => ({
            content: a.contenido.toString('base64'),
            filename: a.nombre,
            type: a.tipo,
            disposition: 'attachment',
          })),
        }),
      });
      if (!response.ok) throw new Error(`SENDGRID_${response.status}`);
      return response.headers.get('x-message-id') ?? 'sendgrid';
    }
    const emulador = this.gateway.mockBaseUrl;
    if (emulador) {
      const buzon = new URL('/mock/inbox/email', emulador);
      const adjuntos = mensaje.adjuntos.map((a) => `${a.nombre} (${a.contenido.length} bytes)`);
      const response = await fetch(buzon, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to: destinatario,
          subject: mensaje.asunto,
          body: `${mensaje.cuerpo}${adjuntos.length ? `\n\nAdjuntos: ${adjuntos.join(', ')}` : ''}`,
        }),
      });
      if (!response.ok) throw new Error(`BUZON_MOCK_${response.status}`);
      return `mock-inbox-${Date.now()}`;
    }
    return `mock-${Date.now()}`;
  }

  listar(documentId: string) {
    return this.deliveryModel.findAll({
      where: { documentId: { [Op.eq]: documentId } },
      order: [['createdAt', 'ASC']],
    });
  }
}
