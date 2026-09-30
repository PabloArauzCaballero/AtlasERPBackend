import { correoDePropuesta } from './proposal-email.template';

const base = {
  proposal: {
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
    ],
  } as never,
  account: { tradeName: 'Multicenter', legalName: 'Multicenter S.R.L.' } as never,
  contactName: 'Justin Saldías',
  message: 'Como conversamos el martes,\nles dejo la propuesta.',
  sender: { fullName: 'Pablo Arauz', email: 'pablo@atlas.bo', roleLabel: 'Gerente comercial' },
  pdfAttached: true,
};

/** El correo lo escribe una persona a otra: saluda por el nombre, firma quien envía, y responde a ella. */
describe('correo de la propuesta', () => {
  it('saluda al contacto por su nombre, firma quien envía y las respuestas le llegan a esa persona', () => {
    const correo = correoDePropuesta(base);
    expect(correo.text.startsWith('Hola, Justin:')).toBe(true);
    expect(correo.fromName).toBe('Pablo Arauz · ATLAS');
    expect(correo.replyTo).toBe('pablo@atlas.bo');
    expect(correo.html).toContain('Pablo Arauz');
    expect(correo.html).toContain('Gerente comercial · ATLAS');
    expect(correo.html).toContain('Responder a Pablo');
    expect(correo.html).toContain('30 de octubre de 2026');
    expect(correo.html).toContain('Comisión por venta');
  });

  it('sin contacto con nombre saluda al equipo del comercio', () => {
    expect(
      correoDePropuesta({ ...base, contactName: null }).text.startsWith(
        'Hola, equipo de Multicenter:',
      ),
    ).toBe(true);
  });

  it('escapa lo que escribe el comercial: su nota no puede inyectar HTML', () => {
    const html = correoDePropuesta({ ...base, message: '<script>alert(1)</script>' }).html;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('no enseña al comercio el ingreso estimado de ATLAS', () => {
    const correo = correoDePropuesta(base);
    expect(`${correo.text}${correo.html}`).not.toMatch(/50[.,]?000|Ingreso mensual/);
  });
});
