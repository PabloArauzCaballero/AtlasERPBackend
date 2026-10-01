import { generateDocumentSchema } from '../../documents/documents.schemas';
import {
  payloadPropuesta,
  payloadPropuestaComercial,
  PROPOSAL_BRAND_ID,
  ProposalPdfService,
} from './proposal-pdf.service';

/**
 * El PDF de la propuesta tiene que pasar el contrato de `generic-result-report` o el worker lo
 * rechaza; y como lo recibe un comercio, no puede llevar cifras internas ni ir sin firma.
 */
const propuesta = {
  proposalNumber: 'PROP-2026-000002',
  validUntil: '2026-10-30',
  totalEstimatedMonthlyRevenue: '50000',
  lines: [
    {
      termType: 'MDR',
      billingTiming: 'PER_TRANSACTION',
      description: 'MDR',
      ratePercent: '2.5',
      fixedAmount: null,
      minimumMonthlyAmount: null,
      currency: 'BOB',
    },
    {
      termType: 'MINIMUM_MONTHLY_FEE',
      billingTiming: 'MONTHLY',
      description: 'Mínimo',
      ratePercent: null,
      fixedAmount: null,
      minimumMonthlyAmount: '300',
      currency: 'BOB',
    },
  ],
};
const cuenta = {
  legalName: 'Multicenter S.R.L.',
  tradeName: 'Multicenter',
  taxId: '1234567',
  taxIdComplement: null,
  city: 'Santa Cruz',
};
const firma = { fullName: 'Ana Pérez', email: 'ana@atlas.bo', roleLabel: 'Ejecutivo comercial' };

describe('propuesta en PDF', () => {
  it('cumple el contrato y se lee como propuesta: carta, nota, qué gana, condiciones, cómo funciona, pasos, datos', () => {
    const payload = payloadPropuesta(
      propuesta as never,
      cuenta as never,
      'Como conversamos el martes.',
      firma,
    );
    expect(
      generateDocumentSchema.safeParse({
        templateId: 'generic-result-report',
        filename: 'p.pdf',
        payload,
      }).success,
    ).toBe(true);
    expect((payload.sections as Array<{ title: string }>).map((s) => s.title)).toEqual([
      'Para Multicenter',
      'Una nota de Ana Pérez',
      'Qué gana Multicenter con ATLAS',
      'Condiciones económicas',
      'Cómo funciona',
      'Próximos pasos',
      'Datos del comercio',
    ]);
    const tabla = (
      payload.sections as Array<{ table?: { rows: Array<Record<string, unknown>> } }>
    )[3]!.table!;
    expect(tabla.rows[0]).toMatchObject({
      concepto: 'Comisión por venta',
      condicion: '2,5 %',
      cobro: 'Por cada venta',
    });
    expect(tabla.rows[1]).toMatchObject({ condicion: 'Bs 300,00', detalle: '—' });
  });

  it('firma la persona que envía y NO muestra el ingreso estimado de ATLAS', () => {
    const payload = payloadPropuesta(propuesta as never, cuenta as never, null, firma);
    expect(payload.signatures).toEqual([
      { name: 'Ana Pérez', role: 'Ejecutivo comercial · ATLAS' },
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/50[.,]?000|Ingreso mensual/);
  });

  it('pide la plantilla propia con el membrete comercial', async () => {
    const documents = {
      generateInternal: jest.fn(async () => ({ buffer: Buffer.from('%PDF'), filename: 'p.pdf' })),
      generate: jest.fn(),
    };
    const service = new ProposalPdfService(
      {} as never,
      documents as never,
      { warn: jest.fn() } as never,
    );
    await service.pdf(propuesta as never, cuenta as never, 'Nota', firma);
    const [plantilla, payload, , marca] = documents.generateInternal.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      string,
      string,
    ];
    expect(plantilla).toBe('propuesta-comercial');
    expect(marca).toBe(PROPOSAL_BRAND_ID);
    expect(payload).toMatchObject({
      saludo: 'Señores de Multicenter:',
      nota: { autor: 'Ana Pérez', texto: 'Nota' },
      firma: { nombre: 'Ana Pérez', cargo: 'Ejecutivo comercial · ATLAS', correo: 'ana@atlas.bo' },
      comercio: {
        nombre: 'Multicenter',
        razonSocial: 'Multicenter S.R.L.',
        nit: '1234567',
        ciudad: 'Santa Cruz',
      },
    });
    expect(JSON.stringify(payload)).not.toMatch(/50[.,]?000|Ingreso mensual/);
    expect(documents.generate).not.toHaveBeenCalled();
  });

  it('si el entorno aún no tiene la plantilla, sale con la genérica antes que sin PDF', async () => {
    const documents = {
      generateInternal: jest.fn().mockRejectedValueOnce(new Error('TEMPLATE_NOT_FOUND')),
      generate: jest.fn(async () => ({ buffer: Buffer.from('%PDF'), filename: 'p.pdf' })),
    };
    const service = new ProposalPdfService(
      {} as never,
      documents as never,
      { warn: jest.fn() } as never,
    );
    await service.pdf(propuesta as never, cuenta as never, null, firma);
    expect(documents.generate).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'generic-result-report' }),
      PROPOSAL_BRAND_ID,
    );
  });
  describe('lo que se le promete al comercio', () => {
    const beneficios = () =>
      payloadPropuestaComercial(propuesta as never, cuenta as never, null, firma)
        .beneficios as Array<{ titulo: string; texto: string }>;

    it('aclara que ATLAS paga si el cliente final no paga: riesgo cero en sus cuentas por cobrar', () => {
      const credito = beneficios().find((b) => b.titulo === 'Crédito a cargo de ATLAS');
      expect(credito?.texto).toMatch(/no paga, paga ATLAS/);
      expect(credito?.texto).toMatch(/cuentas por cobrar tienen riesgo cero/);
    });

    it('dice que el cobro con QR es directo con su negocio y que ningún dinero pasa por ATLAS', () => {
      const qr = beneficios().find((b) => b.titulo.startsWith('Cobro con QR'));
      expect(qr?.texto).toMatch(/directo con su negocio/);
      expect(qr?.texto).toMatch(/ningún dinero pasa por las cuentas de ATLAS/);
    });

    it('cambia «Acompañamiento» por «Simplicidad»: sin catálogo; escanea el QR del negocio y del POS', () => {
      const titulos = beneficios().map((b) => b.titulo);
      expect(titulos).not.toContain('Acompañamiento');
      const simple = beneficios().find((b) => b.titulo === 'Simplicidad');
      expect(simple?.texto).toMatch(/ningún catálogo/);
      expect(simple?.texto).toMatch(/QR que identifica a su negocio y a su POS/);
      expect(simple?.texto).toMatch(/QR bancario real/);
    });

    it('el PDF de respaldo (informe genérico) dice lo mismo', () => {
      const payload = payloadPropuesta(propuesta as never, cuenta as never, null, firma);
      const campos = (
        payload.sections as Array<{ title: string; fields?: Array<{ label: string }> }>
      ).find((sec) => sec.title.startsWith('Qué gana'))!.fields!;
      expect(campos.map((f) => f.label)).toEqual([
        'Más ventas',
        'Crédito a cargo de ATLAS',
        'Cobro con QR, directo a su negocio',
        'Simplicidad',
      ]);
    });
  });
});
