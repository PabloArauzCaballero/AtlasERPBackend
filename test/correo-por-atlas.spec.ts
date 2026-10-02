/**
 * El ERP no tiene proveedor de correo: hasta el 2026-10-01 las facturas y los avisos de anuncios
 * quedaban SIMULATED (o iban a un SendGrid que nadie contrató). Ahora salen por AtlasBackend, que los
 * manda por la Gmail de ATLAS, firmados con el secreto del outbox. Estas pruebas fijan que, con ese
 * secreto, es el modo por defecto; que la firma es la que AtlasBackend verifica; y que la factura
 * lleva PDF y XML.
 */
import { verifyOutboxSignature } from '../src/workers/outbox/http-event-publisher';

const SECRETO = 'secreto-del-outbox-con-mas-de-32-caracteres!!';
const originalEnv = { ...process.env };
afterEach(() => {
  jest.resetModules();
  jest.restoreAllMocks();
  process.env = { ...originalEnv };
});

function base(extra: Record<string, string>): void {
  process.env.DOTENV_CONFIG_PATH = '/nonexistent/atlas-test.env';
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = 'postgres://atlas:atlas@localhost:5432/atlas';
  process.env.JWT_ACCESS_SECRET = 'development_secret_with_more_than_32_chars';
  process.env.ATLAS_IDENTITY_BASE_URL = 'http://atlas-backend:3005/api/v1';
  delete process.env.EMAIL_PROVIDER_MODE;
  delete process.env.OUTBOX_DELIVERY_SIGNING_SECRET;
  delete process.env.SIAT_MODE;
  Object.assign(process.env, extra);
}

describe('modo de correo del ERP', () => {
  it('sin declararlo y con el secreto del outbox, sale por ATLAS', async () => {
    base({ OUTBOX_DELIVERY_SIGNING_SECRET: SECRETO });
    const { env } = await import('../src/config/env');
    expect(env.EMAIL_PROVIDER_MODE).toBe('atlas');
  });

  it('sin secreto sigue siendo mock (no finge envíos)', async () => {
    base({});
    const { env } = await import('../src/config/env');
    expect(env.EMAIL_PROVIDER_MODE).toBe('mock');
  });

  it('atlas declarado sin secreto no arranca', async () => {
    base({ EMAIL_PROVIDER_MODE: 'atlas' });
    await expect(import('../src/config/env')).rejects.toThrow(
      /EMAIL_PROVIDER_MODE=atlas firma el correo/,
    );
  });
});

describe('transporte por ATLAS', () => {
  it('firma el cuerpo como lo verifica AtlasBackend y lleva PDF y XML', async () => {
    base({ OUTBOX_DELIVERY_SIGNING_SECRET: SECRETO });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { provider: 'gmail_api', messageId: 'gm-7' } }),
    } as Response);
    const { enviarCorreoErp } = await import('../src/common/mail/erp-mail.transport');
    const resultado = await enviarCorreoErp({
      to: 'comprador@example.com',
      subject: 'Su factura N° 123',
      text: 'Adjuntamos su factura.',
      reference: 'siat:doc-1:EMISION',
      attachments: [
        {
          filename: 'factura-123.pdf',
          contentType: 'application/pdf',
          content: Buffer.from('%PDF'),
        },
        {
          filename: 'factura-123.xml',
          contentType: 'application/xml',
          content: Buffer.from('<factura/>'),
        },
      ],
    });
    expect(resultado).toEqual({ status: 'SENT', providerMessageId: 'gm-7' });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://atlas-backend:3005/api/v1/internal/integration/erp/mail');
    const cuerpo = String(init.body);
    const firma = (init.headers as Record<string, string>)['x-atlas-signature'];
    expect(verifyOutboxSignature({ secret: SECRETO, header: firma, rawBody: cuerpo })).toBe(true);
    expect(
      JSON.parse(cuerpo).attachments.map((a: { contentType: string }) => a.contentType),
    ).toEqual(['application/pdf', 'application/xml']);
  });

  it('si ATLAS no tiene correo (503) lanza con el motivo: la entrega no se da por enviada', async () => {
    base({ OUTBOX_DELIVERY_SIGNING_SECRET: SECRETO });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { code: 'MAIL_PROVIDER_NOT_CONFIGURED' } }),
    } as Response);
    const { enviarCorreoErp } = await import('../src/common/mail/erp-mail.transport');
    await expect(
      enviarCorreoErp({ to: 'a@b.co', subject: 's', text: 't', reference: 'r' }),
    ).rejects.toThrow('ATLAS_MAIL_503_MAIL_PROVIDER_NOT_CONFIGURED');
  });
});

describe('texto plano de los avisos de anuncios', () => {
  it('no deja ni un < ni un > aunque el HTML venga mal formado', async () => {
    base({});
    const { textoPlano } = await import('../src/modules/ads/services/email-messaging.service');
    const texto = textoPlano('<p>Hola</p><scr<script>ipt>alert(1)</script><br>Fin &nbsp;ya');
    expect(texto).not.toMatch(/[<>]/);
    expect(texto).toContain('Hola');
    expect(texto).toContain('Fin');
  });
});
