import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { gunzipSync } from 'node:zlib';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PinoLoggerService } from '../../../../common/logger/pino-logger.service';
import { ElectronicTaxDocumentModel, SiatEmailDeliveryModel } from '../../../../database/models';
import { FiscalPdfService } from './fiscal-pdf.service';
import { enviarCorreoErp } from '../../../../common/mail/erp-mail.transport';
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
 * Transporte: `common/mail/erp-mail.transport.ts` (por defecto AtlasBackend lo manda por la Gmail de
 * ATLAS, con el PDF y el XML; con el emulador del SIN y en `mock`, el buzón QA del mock, sin adjuntos).
 *
 * Sólo un proveedor real deja la fila en `SENT`. El buzón del emulador y el modo `mock` la dejan en
 * `SIMULATED`, sin `sentAt`: el comprador NO recibió nada, y la fila no puede afirmar lo contrario.
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
      const { providerMessageId, simulado } = await this.transportar(
        entrega.recipient,
        mensaje,
        `siat:${documento.id}:${entrega.kind}`,
      );
      await entrega.update({
        status: simulado ? 'SIMULATED' : 'SENT',
        sentAt: simulado ? null : new Date(),
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
    referencia: string,
  ): Promise<{ providerMessageId: string; simulado: boolean }> {
    const enviado = await enviarCorreoErp(
      {
        to: destinatario,
        subject: mensaje.asunto,
        text: mensaje.cuerpo,
        reference: referencia,
        attachments: mensaje.adjuntos.map((a) => ({
          filename: a.nombre,
          contentType: a.tipo === 'application/xml' ? 'application/xml' : 'application/pdf',
          content: a.contenido,
        })),
      },
      { mockInboxBaseUrl: this.gateway.mockBaseUrl },
    );
    return {
      providerMessageId: enviado.providerMessageId,
      simulado: enviado.status === 'SIMULATED',
    };
  }

  listar(documentId: string) {
    return this.deliveryModel.findAll({
      where: { documentId: { [Op.eq]: documentId } },
      order: [['createdAt', 'ASC']],
    });
  }
}
