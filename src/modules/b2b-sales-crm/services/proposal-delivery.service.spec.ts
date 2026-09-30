import { BadGatewayException, BadRequestException, ConflictException } from '@nestjs/common';
import { OpportunityStage, ProposalStatus } from '../b2b-sales-crm.enums';
import { B2BPipelineService } from './b2b-pipeline.service';
import { ProposalDeliveryService } from './proposal-delivery.service';

jest.mock('../../../config/env', () => {
  const actual = jest.requireActual('../../../config/env');
  return { env: { ...actual.env, EMAIL_PROVIDER_MODE: 'mock', SIAT_MOCK_BASE_URL: undefined } };
});

/**
 * «Enviar al cliente» sólo cambiaba el estado: el comercio nunca recibía nada y nadie elegía a quién
 * iba. Y una oportunidad podía arrastrarse a «Propuesta» sin tener ninguna. Cada prueba falla sin
 * su arreglo.
 */
const USER = { sub: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' } as never;
const logger = { infoContext: jest.fn(), warn: jest.fn() };
const CONTACTO = '22222222-2222-4222-8222-222222222222';

function propuesta(status: string = ProposalStatus.DRAFT) {
  return {
    id: 'prop-1',
    accountId: 'cuenta-1',
    opportunityId: 'op-1',
    proposalNumber: 'PROP-2026-000002',
    status,
    validUntil: '2026-10-30',
    totalEstimatedMonthlyRevenue: '50000',
    lines: [
      {
        termType: 'MDR',
        billingTiming: 'PER_TRANSACTION',
        description: 'MDR',
        ratePercent: '2.5',
        fixedAmount: null,
        currency: 'BOB',
      },
    ],
    update: jest.fn(async function (this: { status: string }, values: { status: string }) {
      this.status = values.status;
    }),
  };
}

function build(
  prop = propuesta(),
  contactos = [{ id: CONTACTO, fullName: 'Ana Pérez', email: 'ana@multicenter.bo' }],
) {
  const repo = {
    findProposalWithLines: jest.fn(async () => prop),
    proposals: { findByPk: jest.fn(async () => prop) },
    approvalRequests: { findOne: jest.fn(async () => null) },
    accounts: { findByPk: jest.fn(async () => ({ tradeName: 'Multicenter' })) },
    contacts: { findAll: jest.fn(async () => contactos) },
  };
  const logs = { record: jest.fn(async () => undefined) };
  const pdf = {
    pdf: jest.fn(async () => ({
      buffer: Buffer.from('%PDF-1.7 propuesta'),
      filename: 'propuesta-PROP-2026-000002.pdf',
    })),
  };
  return {
    service: new ProposalDeliveryService(
      repo as never,
      logs as never,
      logger as never,
      pdf as never,
    ),
    repo,
    logs,
    prop,
    pdf,
  };
}

describe('enviar una propuesta al comercio', () => {
  afterEach(() => jest.restoreAllMocks());

  it('pide destinatarios: un contacto de OTRA cuenta se rechaza y la propuesta no cambia', async () => {
    const { service, prop } = build(propuesta(), []);
    await expect(
      service.send('prop-1', { contactIds: [CONTACTO], extraEmails: [] }, USER),
    ).rejects.toThrow(BadRequestException);
    expect(prop.update).not.toHaveBeenCalled();
  });

  it('sin proveedor el envío queda SIMULATED y lo dice; la propuesta pasa a SENT y queda registrada', async () => {
    const { service, prop, logs } = build();
    const result = await service.send(
      'prop-1',
      { contactIds: [CONTACTO], extraEmails: ['ANA@multicenter.bo', 'gerencia@multicenter.bo'] },
      USER,
    );
    expect(result.deliveries).toEqual([
      { email: 'ana@multicenter.bo', contactName: 'Ana Pérez', status: 'SIMULATED', error: null },
      { email: 'gerencia@multicenter.bo', contactName: null, status: 'SIMULATED', error: null },
    ]);
    expect(prop.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: ProposalStatus.SENT }),
    );
    expect(logs.record).toHaveBeenCalledWith(
      expect.objectContaining({ actionCode: 'SEND_PROPOSAL' }),
    );
  });

  it('si el proveedor rechaza todos los correos responde 502 y la propuesta sigue sin enviar', async () => {
    const { env } = jest.requireMock('../../../config/env') as { env: Record<string, unknown> };
    Object.assign(env, {
      EMAIL_PROVIDER_MODE: 'sendgrid',
      SENDGRID_API_KEY: 'k',
      EMAIL_FROM: 'crm@atlas.bo',
    });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 401, headers: new Headers() } as Response);
    const { service, prop } = build();
    try {
      await expect(
        service.send('prop-1', { contactIds: [CONTACTO], extraEmails: [] }, USER),
      ).rejects.toThrow(BadGatewayException);
      expect(prop.update).not.toHaveBeenCalled();
    } finally {
      Object.assign(env, { EMAIL_PROVIDER_MODE: 'mock' });
    }
  });

  it('con SendGrid el correo lleva la propuesta en PDF adjunta', async () => {
    const { env } = jest.requireMock('../../../config/env') as { env: Record<string, unknown> };
    Object.assign(env, {
      EMAIL_PROVIDER_MODE: 'sendgrid',
      SENDGRID_API_KEY: 'k',
      EMAIL_FROM: 'crm@atlas.bo',
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 202, headers: new Headers() } as Response);
    const { service } = build();
    try {
      const result = await service.send(
        'prop-1',
        { contactIds: [CONTACTO], extraEmails: [] },
        USER,
      );
      const body = JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body));
      expect(body.attachments).toEqual([
        expect.objectContaining({
          filename: 'propuesta-PROP-2026-000002.pdf',
          type: 'application/pdf',
        }),
      ]);
      expect(result.pdf).toEqual({ attached: true, error: null });
    } finally {
      Object.assign(env, { EMAIL_PROVIDER_MODE: 'mock' });
    }
  });

  it('si el generador de PDF falla, el correo sale igual y la respuesta lo dice', async () => {
    const { service, pdf, prop } = build();
    pdf.pdf.mockRejectedValueOnce(new Error('PDF_WORKER_NOT_CONFIGURED'));
    const result = await service.send('prop-1', { contactIds: [CONTACTO], extraEmails: [] }, USER);
    expect(result.pdf).toEqual({ attached: false, error: 'PDF_WORKER_NOT_CONFIGURED' });
    expect(prop.update).toHaveBeenCalled();
  });

  it('una propuesta aceptada no se vuelve a enviar', async () => {
    const { service } = build(propuesta(ProposalStatus.ACCEPTED));
    await expect(
      service.send('prop-1', { contactIds: [CONTACTO], extraEmails: [] }, USER),
    ).rejects.toThrow(ConflictException);
  });

  it('los destinatarios ofrecidos son los contactos con correo válido de la cuenta', async () => {
    const { service, repo } = build(propuesta(), [
      { id: CONTACTO, fullName: 'Ana Pérez', email: 'ana@multicenter.bo' },
      { id: 'x', fullName: 'Sin correo', email: 'no-es-correo' },
    ] as never);
    const lista = await service.recipients('prop-1');
    expect(lista).toHaveLength(1);
    expect(repo.contacts.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountId: 'cuenta-1', status: 'ACTIVE' }),
      }),
    );
  });
});

describe('mover una oportunidad a Propuesta a mano', () => {
  const pipeline = (propuestas: number) => {
    const op = { id: 'op-1', stage: OpportunityStage.QUALIFICATION, update: jest.fn() };
    const repo = {
      transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb({})),
      opportunities: { findByPk: jest.fn(async () => op) },
      proposals: { count: jest.fn(async () => propuestas), findOne: jest.fn(async () => null) },
      contracts: { findOne: jest.fn(async () => null) },
    };
    const service = new B2BPipelineService(
      repo as never,
      logger as never,
      { record: jest.fn() } as never,
    );
    return { service, op };
  };

  it.each([OpportunityStage.PROPOSAL, OpportunityStage.NEGOTIATION])(
    'sin ninguna propuesta creada no puede pasar a %s',
    async (stage) => {
      const { service, op } = pipeline(0);
      await expect(service.moveOpportunityStage('op-1', { stage } as never, USER)).rejects.toThrow(
        ConflictException,
      );
      expect(op.update).not.toHaveBeenCalled();
    },
  );

  it('con una propuesta creada sí pasa a Propuesta', async () => {
    const { service, op } = pipeline(1);
    await service.moveOpportunityStage('op-1', { stage: OpportunityStage.PROPOSAL } as never, USER);
    expect(op.update).toHaveBeenCalledWith(
      expect.objectContaining({ stage: OpportunityStage.PROPOSAL }),
      expect.anything(),
    );
  });
});
