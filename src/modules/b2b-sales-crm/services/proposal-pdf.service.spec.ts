import { generateDocumentSchema } from '../../documents/documents.schemas';
import { payloadPropuesta, PROPOSAL_BRAND_ID, ProposalPdfService } from './proposal-pdf.service';

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

  it('pide el membrete comercial y, si el generador no lo conoce, usa el de siempre', async () => {
    const documents = {
      generate: jest
        .fn()
        .mockRejectedValueOnce(new Error('BRAND_NOT_FOUND'))
        .mockResolvedValueOnce({ buffer: Buffer.from('%PDF'), filename: 'p.pdf' }),
    };
    const service = new ProposalPdfService(
      {} as never,
      documents as never,
      { warn: jest.fn() } as never,
    );
    await service.pdf(propuesta as never, cuenta as never, null, firma);
    expect(documents.generate.mock.calls[0]![1]).toBe(PROPOSAL_BRAND_ID);
    expect(documents.generate.mock.calls[1]![1]).toBeUndefined();
  });
});
