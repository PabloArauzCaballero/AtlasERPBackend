import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentsService, type GeneratedPdf } from '../../documents/documents.service';
import type { GenerateDocumentDto } from '../../documents/documents.schemas';
import type { B2BAccountModel, CommercialProposalModel } from '../models/b2b-sales-crm.models';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';

const TIPO: Readonly<Record<string, string>> = {
  MDR: 'Comisión por transacción (MDR)',
  SUBSCRIPTION: 'Suscripción',
  SETUP_FEE: 'Cargo de habilitación',
  SERVICE_FEE: 'Cargo por servicio',
  PENALTY: 'Penalidad',
  MINIMUM_MONTHLY_FEE: 'Mínimo mensual',
};

const COBRO: Readonly<Record<string, string>> = {
  PER_TRANSACTION: 'Por transacción',
  MONTHLY: 'Mensual',
  ONE_TIME: 'Único',
  ON_DEMAND: 'A demanda',
};

export function importe(valor: string | number | null | undefined, currency = 'BOB'): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return String(valor);
  const cifra = numero.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency === 'BOB' ? 'Bs' : currency} ${cifra}`;
}

/** `2026-10-30` → `30/10/2026`; sin fecha, «sin fecha límite». */
function fecha(valor: string | Date | null | undefined): string {
  if (!valor) return 'sin fecha límite';
  const iso = valor instanceof Date ? valor.toISOString() : String(valor);
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/**
 * La propuesta comercial como DOCUMENTO de ATLAS: membrete del ERP (lo pone el worker con
 * `brandId: atlas-erp`), carta al comercio, condiciones en tabla, el mensaje del comercial y firma.
 *
 * Es lo que se adjunta al correo al enviarla y lo que descarga «Ver PDF» en la fila: el mismo
 * documento en los dos sitios, así lo que ve el comercial es lo que recibe el comercio.
 */
@Injectable()
export class ProposalPdfService {
  constructor(
    private readonly repository: B2BSalesCrmRepository,
    private readonly documents: DocumentsService,
  ) {}

  get enabled(): boolean {
    return this.documents.enabled;
  }

  async pdfById(proposalId: string, message: string | null = null): Promise<GeneratedPdf> {
    const proposal = await this.repository.findProposalWithLines(proposalId);
    if (!proposal) throw new NotFoundException('Propuesta no encontrada.');
    const account = await this.repository.accounts.findByPk(proposal.accountId);
    return this.pdf(proposal, account, message);
  }

  pdf(
    proposal: CommercialProposalModel,
    account: B2BAccountModel | null,
    message: string | null,
  ): Promise<GeneratedPdf> {
    return this.documents.generate({
      templateId: 'generic-result-report',
      filename: `propuesta-${proposal.proposalNumber}.pdf`,
      payload: payloadPropuesta(proposal, account, message),
    } as GenerateDocumentDto);
  }
}

export function payloadPropuesta(
  proposal: CommercialProposalModel,
  account: B2BAccountModel | null,
  message: string | null,
): Record<string, unknown> {
  const comercio = account?.tradeName || account?.legalName || 'el comercio';
  const lineas = proposal.lines ?? [];
  const nit = account?.taxId
    ? `${account.taxId}${account.taxIdComplement ? `-${account.taxIdComplement}` : ''}`
    : '—';
  const secciones: Array<Record<string, unknown>> = [
    {
      title: `Señores de ${comercio}`,
      description:
        `Nos es grato presentarles la propuesta comercial ${proposal.proposalNumber} para que ${comercio} ` +
        'ofrezca a sus clientes compras en cuotas con ATLAS. A continuación detallamos las condiciones ' +
        'económicas y la vigencia de esta oferta.',
    },
  ];
  if (message?.trim()) {
    secciones.push({
      title: 'Mensaje de su ejecutivo comercial',
      description: message.trim().slice(0, 1_000),
    });
  }
  secciones.push(
    {
      title: 'Datos del comercio',
      fields: [
        { label: 'Razón social', value: account?.legalName ?? '—' },
        { label: 'Nombre comercial', value: account?.tradeName ?? '—' },
        { label: 'NIT', value: nit },
        { label: 'Ciudad', value: account?.city ?? '—' },
      ],
    },
    {
      title: 'Condiciones económicas',
      description: lineas.length === 0 ? 'Esta propuesta no detalla condiciones.' : undefined,
      table:
        lineas.length === 0
          ? undefined
          : {
              columns: [
                { key: 'concepto', label: 'Concepto' },
                { key: 'detalle', label: 'Detalle' },
                { key: 'tasa', label: 'Tasa' },
                { key: 'monto', label: 'Monto' },
                { key: 'cobro', label: 'Cobro' },
              ],
              rows: lineas.map((line) => ({
                concepto: TIPO[line.termType] ?? line.termType,
                detalle: line.description,
                tasa:
                  line.ratePercent !== null && line.ratePercent !== undefined
                    ? `${line.ratePercent} %`
                    : '—',
                monto:
                  line.fixedAmount !== null && line.fixedAmount !== undefined
                    ? importe(line.fixedAmount, line.currency)
                    : line.minimumMonthlyAmount
                      ? `Mínimo ${importe(line.minimumMonthlyAmount, line.currency)}`
                      : '—',
                cobro: COBRO[line.billingTiming] ?? line.billingTiming,
              })),
            },
    },
    {
      title: 'Vigencia y aceptación',
      description:
        `Esta propuesta es válida hasta el ${fecha(proposal.validUntil)}. Para aceptarla basta con responder ` +
        'al correo con el que la recibieron; a partir de la aceptación preparamos el contrato de afiliación ' +
        'con estas mismas condiciones.',
    },
  );
  return {
    title: `Propuesta comercial ${proposal.proposalNumber}`,
    subtitle: comercio,
    summary: [
      { label: 'Ingreso mensual estimado', value: importe(proposal.totalEstimatedMonthlyRevenue) },
      { label: 'Válida hasta', value: fecha(proposal.validUntil) },
      { label: 'Condiciones', value: lineas.length },
    ],
    sections: secciones.map((seccion) =>
      Object.fromEntries(Object.entries(seccion).filter(([, v]) => v !== undefined)),
    ),
    signatures: [{ name: 'Equipo comercial', role: 'ATLAS' }],
  };
}
