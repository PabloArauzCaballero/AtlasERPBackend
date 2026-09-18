import { ServiceUnavailableException } from '@nestjs/common';

process.env.PDF_WORKER_URL = 'http://pdf-worker.test:3100';
process.env.PDF_WORKER_SERVICE_KEY = 'clave-de-servicio-de-pruebas-con-32-caracteres!';

const logger = { error: jest.fn() };

async function servicio() {
  const { DocumentsService } = await import('./documents.service');
  return new DocumentsService(logger as never);
}

const pdf = () =>
  new Response(Buffer.from('%PDF-1.7 prueba'), {
    status: 200,
    headers: { 'content-type': 'application/pdf' },
  });

describe('DocumentsService.generate · plantilla', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sin templateId pide el informe genérico, y lo dice explícito al worker', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => pdf());
    const service = await servicio();

    await service.generate({ payload: { title: 'x', sections: [{ title: 's' }] } });
    await service.generate({
      templateId: 'generic-result-report',
      payload: { title: 'y', sections: [{ title: 's' }] },
    });

    /*
     * El `templateId` viaja SIEMPRE, también cuando la pantalla no lo puso: el worker elige
     * plantilla por ese campo, y mandarlo vacío dejaría la elección a su valor por defecto.
     */
    const cuerpos = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(String(init?.body)) as { templateId: string },
    );
    expect(cuerpos.map((c) => c.templateId)).toEqual([
      'generic-result-report',
      'generic-result-report',
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://pdf-worker.test:3100/pdf/generate');
  });

  it('un 200 que no es application/pdf no se entrega como PDF', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"documentId":"DOC-1"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const service = await servicio();
    await expect(
      service.generate({ payload: { title: 'x', sections: [{ title: 's' }] } }),
    ).rejects.toMatchObject({
      response: { code: 'PDF_GENERATION_WRONG_TYPE' },
    });
  });

  it('el worker caído es un 503 con código, no un 500 mudo', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const service = await servicio();
    const error = await service
      .generate({ payload: { title: 'x', sections: [{ title: 's' }] } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual(
      expect.objectContaining({ code: 'PDF_WORKER_UNREACHABLE' }),
    );
  });
});
