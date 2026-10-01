import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLoggerService } from '../../../common/logging/pino-logger.service';
import { DocumentsService, type GeneratedPdf } from '../../documents/documents.service';
import type { GenerateDocumentDto } from '../../documents/documents.schemas';
import type { B2BAccountModel, CommercialProposalModel } from '../models/b2b-sales-crm.models';
import { B2BSalesCrmRepository } from '../repositories/b2b-sales-crm.repository';
import type { ProposalSender } from './proposal-email.template';
import { condicionesDePropuesta, fechaLegible } from './proposal-terms';

/** Membrete para lo que recibe un comercio: «ATLAS · Compras en cuotas para su comercio». */
export const PROPOSAL_BRAND_ID = 'atlas-comercial';

/**
 * La propuesta comercial como DOCUMENTO de ATLAS: la adjunta al correo y la descarga «Ver PDF».
 *
 * La primera versión (2026-09-30) era un volcado de campos: sin presentación, sin decir qué hace
 * ATLAS por el comercio ni qué pasa después, firmada por «Equipo comercial» y con el ingreso
 * mensual ESTIMADO de ATLAS a la vista del comercio. Ahora se lee como una propuesta: carta,
 * nota de quien la envía, qué gana el comercio, condiciones, cómo funciona, próximos pasos, y la
 * firma de la persona que la manda.
 */
@Injectable()
export class ProposalPdfService {
  constructor(
    private readonly repository: B2BSalesCrmRepository,
    private readonly documents: DocumentsService,
    private readonly logger: PinoLoggerService,
  ) {}

  async pdfById(proposalId: string, sender: ProposalSender | null = null): Promise<GeneratedPdf> {
    const proposal = await this.repository.findProposalWithLines(proposalId);
    if (!proposal) throw new NotFoundException('Propuesta no encontrada.');
    const account = await this.repository.accounts.findByPk(proposal.accountId);
    return this.pdf(proposal, account, null, sender);
  }

  async pdf(
    proposal: CommercialProposalModel,
    account: B2BAccountModel | null,
    message: string | null,
    sender: ProposalSender | null = null,
  ): Promise<GeneratedPdf> {
    const filename = `propuesta-${proposal.proposalNumber}.pdf`;
    try {
      return await this.documents.generateInternal(
        'propuesta-comercial',
        payloadPropuestaComercial(proposal, account, message, sender),
        filename,
        PROPOSAL_BRAND_ID,
      );
    } catch (error) {
      // La plantilla propia vive en el worker del Motor: mientras un entorno no la tenga
      // desplegada, la propuesta sale con la genérica antes que sin PDF.
      this.logger.warn('El generador no tiene la plantilla de propuesta; se usa la genérica.', {
        layer: 'service',
        module: 'b2b-sales-crm',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const documento = {
      templateId: 'generic-result-report',
      filename: `propuesta-${proposal.proposalNumber}.pdf`,
      payload: payloadPropuesta(proposal, account, message, sender),
    } as GenerateDocumentDto;
    try {
      return await this.documents.generate(documento, PROPOSAL_BRAND_ID);
    } catch (error) {
      // Mientras el generador no conozca la marca comercial, mejor con el membrete de siempre que
      // sin PDF: el comercio recibe igual la propuesta completa.
      this.logger.warn(
        'El generador no aceptó la marca comercial; se usa el membrete por defecto.',
        {
          layer: 'service',
          module: 'b2b-sales-crm',
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return this.documents.generate(documento);
    }
  }
}

/**
 * Contenido para la plantilla `propuesta-comercial@1.0.0` del worker (su `schema.ts` es el
 * contrato). Los textos se redactan AQUÍ: la plantilla decide cómo se ve, no qué se promete.
 */
export function payloadPropuestaComercial(
  proposal: CommercialProposalModel,
  account: B2BAccountModel | null,
  message: string | null,
  sender: ProposalSender | null,
): Record<string, unknown> {
  const comercio = account?.tradeName || account?.legalName || 'su comercio';
  const firmante = sender?.fullName ?? 'Equipo comercial de ATLAS';
  const nit = account?.taxId
    ? `${account.taxId}${account.taxIdComplement ? `-${account.taxIdComplement}` : ''}`
    : undefined;
  const condiciones = condicionesDePropuesta(proposal);
  const sinVacios = <T extends Record<string, unknown>>(objeto: T) =>
    Object.fromEntries(
      Object.entries(objeto).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    );
  return {
    propuesta: {
      numero: proposal.proposalNumber,
      validaHasta: fechaLegible(proposal.validUntil),
      fecha: fechaLegible(new Date()),
    },
    comercio: sinVacios({
      nombre: comercio,
      razonSocial: account?.legalName || undefined,
      nit,
      ciudad: account?.city || undefined,
    }),
    saludo: `Señores de ${comercio}:`,
    introduccion: [
      `Gracias por el tiempo que nos dedicaron. Les presentamos la propuesta para que ${comercio} ` +
        'ofrezca a sus clientes la opción de comprar en cuotas con ATLAS.',
      'En estas páginas encontrarán qué gana su comercio, las condiciones económicas, cómo funciona en ' +
        'el día a día y los pasos para empezar.',
    ],
    ...(message?.trim()
      ? { nota: { autor: firmante, texto: message.trim().slice(0, 1_500) } }
      : {}),
    beneficios: [
      {
        titulo: 'Más ventas',
        texto: 'Sus clientes se llevan hoy lo que necesitan y lo pagan en cuotas.',
      },
      {
        titulo: 'Crédito a cargo de ATLAS',
        texto:
          'ATLAS evalúa al cliente, le otorga el crédito y se encarga de cobrarle. Si el cliente final no paga, paga ATLAS: sus cuentas por cobrar tienen riesgo cero.',
      },
      {
        titulo: 'Cobro con QR, directo a su negocio',
        texto:
          'El cobro con QR es directo con su negocio: ningún dinero pasa por las cuentas de ATLAS.',
      },
      {
        titulo: 'Simplicidad',
        texto:
          'No le pedimos subir ningún catálogo. El cliente escanea el QR que identifica a su negocio y a su POS en el punto de venta, y con eso se carga su QR bancario real.',
      },
    ],
    condiciones: condiciones.map((c) =>
      sinVacios({
        concepto: c.concepto,
        detalle: c.detalle ?? undefined,
        condicion: c.condicion,
        cobro: c.cobro,
      }),
    ),
    ...(condiciones.length
      ? {
          condicionesNota:
            'Estas son todas las condiciones de la propuesta; no hay cargos adicionales.',
        }
      : {}),
    pasos: [
      { titulo: 'Elige', texto: 'El cliente elige su compra y pide pagarla en cuotas.' },
      { titulo: 'Escanea', texto: 'Escanea el QR de cobro de su comercio con la app de ATLAS.' },
      { titulo: 'Aprueba', texto: 'ATLAS aprueba el crédito y el cliente confirma sus cuotas.' },
      { titulo: 'Cobra', texto: 'Su comercio recibe el pago de la venta según esta propuesta.' },
    ],
    proximosPasos: [
      { titulo: 'Aceptación', texto: 'Respondan al correo con el que recibieron esta propuesta.' },
      {
        titulo: 'Contrato',
        texto: 'Preparamos el contrato de afiliación con estas mismas condiciones.',
      },
      {
        titulo: 'Puesta en marcha',
        texto: 'Les entregamos el QR de cobro y capacitamos a su equipo.',
      },
    ],
    cierre:
      'Quedamos atentos a sus comentarios. Si prefieren revisarla juntos, con gusto coordinamos una llamada.',
    firma: sinVacios({
      nombre: firmante,
      cargo: sender ? `${sender.roleLabel} · ATLAS` : 'ATLAS',
      correo: sender?.email ?? undefined,
    }),
  };
}

export function payloadPropuesta(
  proposal: CommercialProposalModel,
  account: B2BAccountModel | null,
  message: string | null,
  sender: ProposalSender | null,
): Record<string, unknown> {
  const comercio = account?.tradeName || account?.legalName || 'su comercio';
  const condiciones = condicionesDePropuesta(proposal);
  const vigencia = fechaLegible(proposal.validUntil);
  const nit = account?.taxId
    ? `${account.taxId}${account.taxIdComplement ? `-${account.taxIdComplement}` : ''}`
    : '—';
  const firmante = sender?.fullName ?? 'Equipo comercial de ATLAS';

  const secciones: Array<Record<string, unknown>> = [
    {
      title: `Para ${comercio}`,
      description:
        `Gracias por el tiempo que nos dedicaron. Les presentamos la propuesta para que ${comercio} ofrezca a sus ` +
        'clientes la opción de comprar en cuotas con ATLAS. En estas páginas encontrarán qué incluye el servicio, ' +
        'las condiciones económicas, cómo funciona en el día a día y los pasos para empezar.',
    },
  ];
  if (message?.trim()) {
    secciones.push({
      title: `Una nota de ${firmante}`,
      description: message.trim().slice(0, 1_000),
    });
  }
  secciones.push(
    {
      title: `Qué gana ${comercio} con ATLAS`,
      fields: [
        {
          label: 'Más ventas',
          value: 'Sus clientes se llevan hoy lo que necesitan y lo pagan en cuotas.',
        },
        {
          label: 'Crédito a cargo de ATLAS',
          value:
            'ATLAS evalúa al cliente, le otorga el crédito y se encarga de cobrarle. Si el cliente final no paga, paga ATLAS: sus cuentas por cobrar tienen riesgo cero.',
        },
        {
          label: 'Cobro con QR, directo a su negocio',
          value:
            'El cobro con QR es directo con su negocio: ningún dinero pasa por las cuentas de ATLAS.',
        },
        {
          label: 'Simplicidad',
          value:
            'No le pedimos subir ningún catálogo. El cliente escanea el QR que identifica a su negocio y a su POS en el punto de venta, y con eso se carga su QR bancario real.',
        },
      ],
    },
    {
      title: 'Condiciones económicas',
      description:
        condiciones.length === 0
          ? 'Esta propuesta no tiene cargos detallados.'
          : 'Estas son todas las condiciones de la propuesta; no hay cargos adicionales a los que se listan aquí.',
      table:
        condiciones.length === 0
          ? undefined
          : {
              columns: [
                { key: 'concepto', label: 'Concepto' },
                { key: 'detalle', label: 'Detalle' },
                { key: 'condicion', label: 'Condición' },
                { key: 'cobro', label: 'Se cobra' },
              ],
              rows: condiciones.map((c) => ({
                concepto: c.concepto,
                detalle: c.detalle ?? '—',
                condicion: c.condicion,
                cobro: c.cobro,
              })),
            },
    },
    {
      title: 'Cómo funciona',
      table: {
        columns: [
          { key: 'paso', label: 'Paso' },
          { key: 'que', label: 'Qué pasa' },
        ],
        rows: [
          {
            paso: '1',
            que: 'El cliente elige su compra en su comercio y dice que quiere pagarla en cuotas.',
          },
          { paso: '2', que: 'Escanea el QR de cobro de su comercio con la app de ATLAS.' },
          { paso: '3', que: 'ATLAS aprueba el crédito y el cliente confirma el plan de cuotas.' },
          {
            paso: '4',
            que: 'Su comercio recibe el pago de la venta según las condiciones de esta propuesta.',
          },
        ],
      },
    },
    {
      title: 'Próximos pasos',
      fields: [
        {
          label: '1. Aceptación',
          value: 'Respondan al correo con el que recibieron esta propuesta.',
        },
        {
          label: '2. Contrato',
          value: 'Preparamos el contrato de afiliación con estas mismas condiciones.',
        },
        {
          label: '3. Puesta en marcha',
          value: 'Les entregamos el QR de cobro y capacitamos a su equipo.',
        },
      ],
    },
    {
      title: 'Datos del comercio',
      fields: [
        { label: 'Razón social', value: account?.legalName ?? '—' },
        { label: 'Nombre comercial', value: account?.tradeName ?? '—' },
        { label: 'NIT', value: nit },
        { label: 'Ciudad', value: account?.city ?? '—' },
      ],
    },
  );

  return {
    title: `Propuesta comercial para ${comercio}`,
    subtitle: `Ventas en cuotas con ATLAS · válida hasta el ${vigencia}`,
    summary: [
      { label: 'Propuesta', value: proposal.proposalNumber },
      { label: 'Válida hasta', value: vigencia },
      { label: 'Condiciones', value: condiciones.length },
      { label: 'Preparada por', value: firmante },
    ],
    sections: secciones.map((seccion) =>
      Object.fromEntries(Object.entries(seccion).filter(([, v]) => v !== undefined)),
    ),
    signatures: [{ name: firmante, role: sender ? `${sender.roleLabel} · ATLAS` : 'ATLAS' }],
  };
}
