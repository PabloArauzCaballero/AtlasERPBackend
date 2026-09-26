/**
 * P-14 — receptor de eventos de Core en el ERP, sin base: firma, contrato HTTP y alta de compra con
 * identidad común. El efecto (inbox, transición del aviso, cola) se mide con PostgreSQL en
 * test/core-events.integration.spec.ts.
 */
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { env } from '../src/config/env';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';
import { registerPurchaseSchema } from '../src/modules/b2b-sales-crm/b2b-sales-crm.schemas';
import { CoreEventsController } from '../src/modules/b2b-sales-crm/controllers/core-events.controller';
import type { CoreEnvelope } from '../src/modules/b2b-sales-crm/integration/core-events.schemas';
import type { CorePaymentEventsService } from '../src/modules/b2b-sales-crm/integration/core-payment-events.service';
import { CoreSignatureGuard } from '../src/modules/b2b-sales-crm/integration/core-signature.guard';
import { signOutboxBody } from '../src/workers/outbox/http-event-publisher';

const SECRET = 'core-a-erp-secreto-de-al-menos-32-caracteres';
const mutableEnv = env as unknown as Record<string, unknown>;
const original = mutableEnv.CORE_EVENTS_SIGNING_SECRET;
afterEach(() => {
  mutableEnv.CORE_EVENTS_SIGNING_SECRET = original;
});

const body = '{"eventKey":"k-1","topic":"payment.confirmed"}';
const now = () => Math.floor(Date.now() / 1000);
const contextFor = (request: Record<string, unknown>): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

describe('CoreSignatureGuard (firma HMAC de Core)', () => {
  const guard = new CoreSignatureGuard();

  it('la ruta es pública para el JWT de usuario: la protege la firma', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CoreEventsController.prototype.receive)).toBe(true);
  });

  it('acepta una firma válida y reciente sobre el cuerpo crudo', () => {
    mutableEnv.CORE_EVENTS_SIGNING_SECRET = SECRET;
    const request = {
      headers: { 'x-atlas-signature': signOutboxBody(SECRET, body, now()) },
      rawBody: Buffer.from(body),
    };
    expect(guard.canActivate(contextFor(request))).toBe(true);
  });

  it('rechaza firma ausente, de otro secreto, sobre otro cuerpo o fuera de ventana (401)', () => {
    mutableEnv.CORE_EVENTS_SIGNING_SECRET = SECRET;
    const cases: Array<[string | undefined, string]> = [
      [undefined, body],
      [signOutboxBody('otro-secreto-de-al-menos-32-caracteres!!', body, now()), body],
      [signOutboxBody(SECRET, body, now()), `${body} `],
      [signOutboxBody(SECRET, body, now() - 3_600), body],
    ];
    for (const [header, raw] of cases) {
      expect(() =>
        guard.canActivate(
          contextFor({ headers: { 'x-atlas-signature': header }, rawBody: Buffer.from(raw) }),
        ),
      ).toThrow(UnauthorizedException);
    }
  });

  it('sin secreto responde 503 (cerrada, nunca abierta) y sin cuerpo crudo 400', () => {
    mutableEnv.CORE_EVENTS_SIGNING_SECRET = undefined;
    expect(() => guard.canActivate(contextFor({ headers: {} }))).toThrow(
      ServiceUnavailableException,
    );
    mutableEnv.CORE_EVENTS_SIGNING_SECRET = SECRET;
    expect(() => guard.canActivate(contextFor({ headers: {} }))).toThrow(BadRequestException);
  });
});

describe('CoreEventsController', () => {
  it('delega y devuelve el desenlace; clave de cabecera distinta de la del sobre es 400', async () => {
    const events = { receive: jest.fn(async () => ({ outcome: 'NOTICE_CONFIRMED' })) };
    const controller = new CoreEventsController(events as unknown as CorePaymentEventsService);
    const envelope = { eventKey: 'k-1' } as CoreEnvelope;
    await expect(controller.receive('k-1', envelope)).resolves.toEqual({
      eventKey: 'k-1',
      outcome: 'NOTICE_CONFIRMED',
    });
    await expect(controller.receive(undefined, envelope)).resolves.toMatchObject({
      eventKey: 'k-1',
    });
    await expect(controller.receive('otra', envelope)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('alta de compra con identidad común (esquema)', () => {
  const base = {
    branchId: randomUUID(),
    consumerId: randomUUID(),
    purchaseAmount: '1500.00',
    downPaymentAmount: '900.00',
    financedAmount: '600.00',
    mdrReceivableDueDate: '2026-10-30',
  };
  const installments = [
    { installmentNumber: 1, dueDate: '2026-10-01', amount: '300.00' },
    { installmentNumber: 2, dueDate: '2026-11-01', amount: '300.00' },
  ];
  const linked = installments.map((i, n) => ({ ...i, coreInstallmentId: String(920001 + n) }));
  const ref = { tenantId: '900001', loanId: '910001' };

  it('coreLoanRef exige coreInstallmentId en cada cuota, sin repetir, y viceversa', () => {
    expect(
      registerPurchaseSchema.safeParse({ ...base, coreLoanRef: ref, installments: linked }).success,
    ).toBe(true);
    expect(registerPurchaseSchema.safeParse({ ...base, installments }).success).toBe(true);
    expect(
      registerPurchaseSchema.safeParse({ ...base, coreLoanRef: ref, installments }).success,
    ).toBe(false);
    expect(registerPurchaseSchema.safeParse({ ...base, installments: linked }).success).toBe(false);
    expect(
      registerPurchaseSchema.safeParse({
        ...base,
        coreLoanRef: ref,
        installments: installments.map((i) => ({ ...i, coreInstallmentId: '920001' })),
      }).success,
    ).toBe(false);
    expect(
      registerPurchaseSchema.safeParse({
        ...base,
        coreLoanRef: { ...ref, loanId: 'L-1' },
        installments: linked,
      }).success,
    ).toBe(false);
  });
});
