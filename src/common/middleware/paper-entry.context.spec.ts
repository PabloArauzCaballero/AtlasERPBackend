import { BadRequestException } from '@nestjs/common';
import { paperEntryContext, parsePaperEntryHeaders } from './paper-entry.context';
import { RequestContextMiddleware } from './request-context.middleware';

describe('parsePaperEntryHeaders', () => {
  it('sin cabecera de canal la petición es normal: null', () => {
    expect(parsePaperEntryHeaders({})).toBeNull();
    expect(parsePaperEntryHeaders({ serial: 'DOC-4F3A9C2E7B10' })).toBeNull();
  });

  it('PAPER con serie válida devuelve la entrada, normalizada a mayúsculas', () => {
    expect(
      parsePaperEntryHeaders({
        channel: 'paper',
        serial: ' doc-4f3a9c2e7b10 ',
        form: 'ERP-CRM-CUENTA-CREAR@a91f3c2e',
      }),
    ).toEqual({
      serial: 'DOC-4F3A9C2E7B10',
      formCode: 'ERP-CRM-CUENTA-CREAR',
      formVersion: 'a91f3c2e',
    });
    expect(
      parsePaperEntryHeaders({ channel: 'PAPER', serial: 'DOC-4F3A9C2E7B10', form: 'ERP-X-Y' }),
    ).toEqual({
      serial: 'DOC-4F3A9C2E7B10',
      formCode: 'ERP-X-Y',
    });
  });

  it('PAPER sin serie, con serie mal formada o con canal desconocido: se rechaza', () => {
    expect(() => parsePaperEntryHeaders({ channel: 'PAPER' })).toThrow(/número de serie/);
    expect(() => parsePaperEntryHeaders({ channel: 'PAPER', serial: 'DOC-123' })).toThrow(
      /número de serie/,
    );
    expect(() => parsePaperEntryHeaders({ channel: 'PAPER', serial: '4F3A9C2E7B10' })).toThrow(
      /número de serie/,
    );
    expect(() => parsePaperEntryHeaders({ channel: 'FAX', serial: 'DOC-4F3A9C2E7B10' })).toThrow(
      /Canal de entrada/,
    );
    expect(() =>
      parsePaperEntryHeaders({ channel: 'PAPER', serial: 'DOC-4F3A9C2E7B10', form: 'minusculas' }),
    ).toThrow(/mal formado/);
  });
});

describe('RequestContextMiddleware · transcripción desde papel', () => {
  const middleware = new RequestContextMiddleware();

  function peticion(headers: Record<string, string>) {
    return {
      header: (name: string) => headers[name.toLowerCase()],
    } as unknown as Parameters<RequestContextMiddleware['use']>[0];
  }
  const respuesta = { setHeader: jest.fn() } as unknown as Parameters<
    RequestContextMiddleware['use']
  >[1];

  it('deja la serie visible para quien escriba la auditoría durante la petición', () => {
    let visto: unknown = 'no se llamó';
    middleware.use(
      peticion({ 'x-atlas-entry-channel': 'PAPER', 'x-atlas-paper-serial': 'DOC-4F3A9C2E7B10' }),
      respuesta,
      () => {
        visto = paperEntryContext.get();
      },
    );
    expect(visto).toEqual({ serial: 'DOC-4F3A9C2E7B10' });
    // Fuera de la petición no queda rastro.
    expect(paperEntryContext.get()).toBeUndefined();
  });

  it('una petición sin cabeceras de papel no tiene contexto de papel', () => {
    let visto: unknown = 'no se llamó';
    middleware.use(peticion({}), respuesta, () => {
      visto = paperEntryContext.get();
    });
    expect(visto).toBeUndefined();
  });

  it('PAPER sin serie válida es un 400 con código propio, antes de que nada se escriba', () => {
    const next = jest.fn();
    expect(() =>
      middleware.use(
        peticion({ 'x-atlas-entry-channel': 'PAPER', 'x-atlas-paper-serial': 'nada' }),
        respuesta,
        next,
      ),
    ).toThrow(BadRequestException);
    expect(next).not.toHaveBeenCalled();
    try {
      middleware.use(peticion({ 'x-atlas-entry-channel': 'PAPER' }), respuesta, next);
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: 'PAPER_ENTRY_INVALID' }),
      );
    }
  });
});
