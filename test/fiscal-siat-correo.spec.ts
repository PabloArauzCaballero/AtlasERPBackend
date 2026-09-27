import { FiscalMailService } from '../src/modules/fiscal/siat/application/fiscal-mail.service';

/** El correo al comprador (D-8): qué se encola y qué dice. El envío real se prueba en integración. */
describe('correo fiscal al comprador', () => {
  function servicio() {
    const sequelize = { query: jest.fn(async () => []) };
    const fiscalPdf = {
      pdf: jest.fn(async () => ({ buffer: Buffer.from('%PDF'), filename: 'factura-7.pdf' })),
    };
    const svc = new FiscalMailService(
      {} as never,
      {} as never,
      fiscalPdf as never,
      { modo: 'disabled', mockBaseUrl: null } as never,
      sequelize as never,
      { warn: jest.fn() } as never,
    );
    return { svc, sequelize, fiscalPdf };
  }
  const documento = (correo: unknown, extra: Record<string, unknown> = {}) =>
    ({
      id: 'doc-1',
      numeroFactura: '7',
      cuf: 'ABC123',
      montoTotal: '58.00',
      xmlSha256: 'f'.repeat(64),
      siatStatus: 'ACCEPTED',
      contingencyFlag: false,
      xmlGzip: null,
      receptorSnapshot: { nombreRazonSocial: 'Farmacia Illimani', correo },
      ...extra,
    }) as never;

  it.each([[null], [''], ['sin-arroba'], ['a@b']])(
    'no encola sin un correo válido (%p)',
    async (correo) => {
      const { svc, sequelize } = servicio();
      await svc.encolar(documento(correo), 'EMISION');
      expect(sequelize.query).not.toHaveBeenCalled();
    },
  );

  it('encola una vez por documento y tipo (ON CONFLICT) y en minúsculas', async () => {
    const { svc, sequelize } = servicio();
    await svc.encolar(documento('Compras@Illimani.BO'), 'EMISION');
    const [sql, opciones] = (sequelize.query.mock.calls[0] ?? []) as unknown as [
      string,
      { bind: unknown[] },
    ];
    expect(sql).toContain('ON CONFLICT (document_id, kind) DO NOTHING');
    expect(opciones.bind).toEqual(['doc-1', 'EMISION', 'compras@illimani.bo']);
  });

  it('el aviso de anulación dice que ya no es válida y no adjunta nada', async () => {
    const { svc, fiscalPdf } = servicio();
    const mensaje = await (
      svc as unknown as {
        componer(
          d: unknown,
          t: string,
        ): Promise<{ asunto: string; cuerpo: string; adjuntos: unknown[] }>;
      }
    ).componer(documento('x@y.bo'), 'ANULACION');
    expect(mensaje.asunto).toBe('Factura N° 7 anulada ante Impuestos Nacionales');
    expect(mensaje.cuerpo).toContain('ya no es válida');
    expect(mensaje.cuerpo).toContain('ABC123');
    expect(mensaje.adjuntos).toEqual([]);
    expect(fiscalPdf.pdf).not.toHaveBeenCalled();
  });

  it('la factura emitida fuera de línea lo explica al comprador', async () => {
    const { svc } = servicio();
    const mensaje = await (
      svc as unknown as {
        componer(
          d: unknown,
          t: string,
        ): Promise<{ cuerpo: string; adjuntos: { nombre: string }[] }>;
      }
    ).componer(documento('x@y.bo', { siatStatus: 'OFFLINE', contingencyFlag: true }), 'EMISION');
    expect(mensaje.cuerpo).toContain('fuera de línea');
    expect(mensaje.adjuntos.map((a) => a.nombre)).toEqual(['factura-7.pdf']);
  });
});
