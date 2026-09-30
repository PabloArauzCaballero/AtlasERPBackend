import { generateDocumentSchema } from '../../documents/documents.schemas';
import { payloadPropuesta } from './proposal-pdf.service';

/** El PDF de la propuesta tiene que pasar el contrato de `generic-result-report` o el worker lo rechaza. */
describe('propuesta en PDF', () => {
  const propuesta = {
    proposalNumber: 'PROP-2026-000002',
    validUntil: '2026-10-30',
    totalEstimatedMonthlyRevenue: '50000',
    lines: [
      {
        termType: 'MDR',
        billingTiming: 'PER_TRANSACTION',
        description: 'Comisión',
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

  it('cumple el contrato de la plantilla y lleva carta, mensaje, datos, condiciones y vigencia', () => {
    const payload = payloadPropuesta(
      propuesta as never,
      cuenta as never,
      'Como conversamos el martes.',
    );
    expect(
      generateDocumentSchema.safeParse({
        templateId: 'generic-result-report',
        filename: 'p.pdf',
        payload,
      }).success,
    ).toBe(true);
    const titulos = (payload.sections as Array<{ title: string }>).map((s) => s.title);
    expect(titulos).toEqual([
      'Señores de Multicenter',
      'Mensaje de su ejecutivo comercial',
      'Datos del comercio',
      'Condiciones económicas',
      'Vigencia y aceptación',
    ]);
    const tabla = (
      payload.sections as Array<{ table?: { rows: Array<Record<string, unknown>> } }>
    )[3]!.table!;
    expect(tabla.rows[0]).toMatchObject({
      concepto: 'Comisión por transacción (MDR)',
      tasa: '2.5 %',
      cobro: 'Por transacción',
    });
    expect(tabla.rows[1]).toMatchObject({ monto: 'Mínimo Bs 300,00' });
  });

  it('sin mensaje ni condiciones sigue siendo un documento válido', () => {
    const payload = payloadPropuesta({ ...propuesta, lines: [] } as never, null, null);
    expect(
      generateDocumentSchema.safeParse({
        templateId: 'generic-result-report',
        filename: 'p.pdf',
        payload,
      }).success,
    ).toBe(true);
    expect((payload.sections as Array<{ title: string }>).map((s) => s.title)).not.toContain(
      'Mensaje de su ejecutivo comercial',
    );
  });
});
