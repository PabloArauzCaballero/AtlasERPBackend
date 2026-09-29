/**
 * Un correo que no salió no puede quedar `SENT` (WP14-ERPB, P1-1).
 *
 * Con EMAIL_PROVIDER_MODE=mock —el valor por defecto— las dos colas de correo guardaban `SENT` con
 * un id de proveedor inventado. Estas pruebas fijan que el modo mock deja `SIMULATED` y sin
 * `sentAt`, y que la configuración que no puede permitírselo no arranca.
 */
import { EmailMessagingService } from '../src/modules/ads/services/email-messaging.service';
import { FiscalMailService } from '../src/modules/fiscal/siat/application/fiscal-mail.service';

const originalEnv = { ...process.env };
afterEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
});

describe('correo de campañas en modo mock', () => {
  it('deja el mensaje SIMULATED, sin sentAt, y nunca SENT', async () => {
    const message = { id: 'm-1', attemptCount: 0, update: jest.fn(async () => undefined) };
    const messages = {
      findAll: jest.fn(async () => [message]),
      update: jest.fn(async () => [1]),
    };
    const svc = new EmailMessagingService({} as never, messages as never, {} as never);

    await expect(svc.processDue()).resolves.toBe(1);

    expect(message.update).toHaveBeenCalledTimes(1);
    const cambios = (message.update.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(cambios).toMatchObject({
      status: 'SIMULATED',
      sentAt: null,
      providerMessageId: 'mock-m-1',
    });
    expect(cambios.status).not.toBe('SENT');
  });
});

describe('correo fiscal al comprador sin proveedor real', () => {
  function servicio(mockBaseUrl: string | null) {
    const entrega = {
      id: 'e-1',
      documentId: 'doc-1',
      kind: 'ANULACION',
      recipient: 'x@y.bo',
      attemptCount: 1,
      update: jest.fn(async () => undefined),
    };
    const documento = {
      id: 'doc-1',
      numeroFactura: '7',
      cuf: 'ABC',
      montoTotal: '58.00',
      receptorSnapshot: { correo: 'x@y.bo' },
    };
    const svc = new FiscalMailService(
      { findByPk: jest.fn(async () => entrega) } as never,
      { findByPk: jest.fn(async () => documento) } as never,
      {} as never,
      { mockBaseUrl } as never,
      {} as never,
      { warn: jest.fn() } as never,
    );
    return { svc, entrega };
  }
  const enviar = (svc: FiscalMailService) =>
    (svc as unknown as { enviar(id: string): Promise<void> }).enviar('e-1');

  it('en modo mock sin emulador queda SIMULATED y sin sentAt', async () => {
    const { svc, entrega } = servicio(null);
    await enviar(svc);
    const cambios = (entrega.update.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(cambios).toMatchObject({ status: 'SIMULATED', sentAt: null });
    expect(String(cambios.providerMessageId)).toMatch(/^mock-/);
  });

  it('por el buzón QA del emulador también queda SIMULATED: el comprador no lo recibió', async () => {
    const fetchOriginal = global.fetch;
    const fetchMock = jest.fn(async () => new Response('{}', { status: 201 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const { svc, entrega } = servicio('http://emulador.test');
      await enviar(svc);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const cambios = (entrega.update.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      expect(cambios).toMatchObject({ status: 'SIMULATED', sentAt: null });
      expect(String(cambios.providerMessageId)).toMatch(/^mock-inbox-/);
    } finally {
      global.fetch = fetchOriginal;
    }
  });
});

describe('guarda de configuración del correo simulado', () => {
  function base(extra: Record<string, string>): void {
    process.env.DOTENV_CONFIG_PATH = '/nonexistent/atlas-test.env';
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgres://atlas:atlas@localhost:5432/atlas';
    process.env.JWT_ACCESS_SECRET = 'development_secret_with_more_than_32_chars';
    delete process.env.EMAIL_PROVIDER_MODE;
    delete process.env.SIAT_MODE;
    Object.assign(process.env, extra);
  }

  it('no arranca en producción con EMAIL_PROVIDER_MODE=mock (ni por defecto)', async () => {
    base({
      NODE_ENV: 'production',
      DB_SSL: 'true',
      DB_SSL_REJECT_UNAUTHORIZED: 'true',
      CORS_ALLOWED_ORIGINS: 'https://atlas.example.com',
      JWT_ACCESS_SECRET: 'production_secret_with_more_than_32_characters',
      JWT_INTERNAL_SECRET: 'production_internal_secret_more_than_32_chars',
    });
    await expect(import('../src/config/env')).rejects.toThrow(
      /EMAIL_PROVIDER_MODE=mock no envía correos .*NODE_ENV=production/,
    );
  });

  it.each(['piloto', 'produccion'])('no arranca con SIAT_MODE=%s y correo mock', async (modo) => {
    base({
      SIAT_MODE: modo,
      SIAT_SOAP_BASE_URL: 'https://siat.example.com',
      SIAT_TOKEN_DELEGADO: 'token-delegado-largo',
      SIAT_CODIGO_SISTEMA: 'SIS-1',
    });
    await expect(import('../src/config/env')).rejects.toThrow(
      new RegExp(`no entrega la factura al comprador: no se admite con SIAT_MODE=${modo}`),
    );
  });

  it('TEST sigue arrancando: SIAT_MODE=mock_server con correo mock (buzón del emulador)', async () => {
    base({ SIAT_MODE: 'mock_server', SIAT_MOCK_BASE_URL: 'http://mock.test' });
    const { env } = await import('../src/config/env');
    expect(env.EMAIL_PROVIDER_MODE).toBe('mock');
  });
});
