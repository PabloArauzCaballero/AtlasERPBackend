import { BadRequestException, ConflictException } from '@nestjs/common';
import { AccountLifecycleStatus } from '../b2b-sales-crm.enums';
import { qualifyAccountSchema } from '../b2b-sales-crm.schemas';
import { B2BAccountsService } from './b2b-accounts.service';
import { B2BPipelineService } from './b2b-pipeline.service';

/**
 * Pablo, 2026-09-28: las acciones de la cuenta son PREDECESORAS —calificar → crear oportunidad →
 * iniciar onboarding— y calificar es CLASIFICAR la cuenta con datos útiles para el CRM.
 */
const logger = { infoContext: jest.fn() };
const TX = { id: 'tx' };
const USUARIO = { sub: 'u-1' } as never;

function cuenta(sobre: Record<string, unknown> = {}) {
  const c: Record<string, unknown> = {
    id: 'acc-1',
    lifecycleStatus: AccountLifecycleStatus.LEAD,
    businessDescription: null,
    notes: null,
    update: jest.fn(async (cambios: Record<string, unknown>) => Object.assign(c, cambios)),
    ...sobre,
  };
  return c;
}

function servicioCuentas(c: Record<string, unknown>) {
  const repo = {
    transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(TX)),
    accounts: { findByPk: jest.fn(async () => c) },
    opportunities: { create: jest.fn() },
    audit: jest.fn(),
  };
  return { repo, service: new B2BAccountsService(repo as never, logger as never, {} as never) };
}

describe('calificar clasifica la cuenta', () => {
  it('con fit guarda la clasificación en la cuenta y la pasa a calificada', async () => {
    const c = cuenta();
    const { service } = servicioCuentas(c);
    const entrada = qualifyAccountSchema.parse({
      hasCommercialFit: true,
      classification: {
        industry: 'COMERCIO',
        businessLine: 'FARMACIA',
        businessDescription: 'Cadena de farmacias con 12 sucursales y venta de dermocosmética.',
        expectedMonthlyVolume: 150000,
        employeeCount: 80,
      },
    });

    await service.qualifyAccount('acc-1', entrada, USUARIO);

    expect(c.update).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycleStatus: AccountLifecycleStatus.QUALIFIED,
        industry: 'COMERCIO',
        businessLine: 'FARMACIA',
        businessDescription: 'Cadena de farmacias con 12 sucursales y venta de dermocosmética.',
        expectedMonthlyVolume: '150000.00',
        employeeCount: 80,
      }),
      { transaction: TX },
    );
  });

  it('con fit y sin saber qué ofrece el negocio se rechaza (400) y la cuenta no cambia', async () => {
    const c = cuenta();
    const { service } = servicioCuentas(c);

    await expect(
      service.qualifyAccount(
        'acc-1',
        qualifyAccountSchema.parse({ hasCommercialFit: true }),
        USUARIO,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(c.update).not.toHaveBeenCalled();
  });

  it('vale la descripción que la cuenta ya tenía', async () => {
    const c = cuenta({ businessDescription: 'Restaurante de comida rápida con delivery propio.' });
    const { service } = servicioCuentas(c);

    await service.qualifyAccount(
      'acc-1',
      qualifyAccountSchema.parse({ hasCommercialFit: true }),
      USUARIO,
    );

    expect(c.update).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycleStatus: AccountLifecycleStatus.QUALIFIED }),
      { transaction: TX },
    );
  });

  it('descalificar no pide clasificación ni la escribe', async () => {
    const c = cuenta();
    const { service } = servicioCuentas(c);
    const entrada = qualifyAccountSchema.parse({
      hasCommercialFit: false,
      disqualificationReason: 'No acepta pagos con tarjeta',
      classification: { industry: 'COMERCIO' },
    });

    await service.qualifyAccount('acc-1', entrada, USUARIO);

    const cambios = (c.update as jest.Mock).mock.calls[0][0];
    expect(cambios).toMatchObject({ lifecycleStatus: AccountLifecycleStatus.DISQUALIFIED });
    expect(cambios).not.toHaveProperty('industry');
  });
});

describe('crear oportunidad exige la cuenta calificada', () => {
  function servicio(c: Record<string, unknown>) {
    const repo = {
      accounts: { findByPk: jest.fn(async () => c) },
      opportunities: {
        create: jest.fn(async (d: Record<string, unknown>) => ({ id: 'op-1', ...d })),
      },
    };
    return { repo, service: new B2BPipelineService(repo as never, logger as never) };
  }
  const entrada = {
    accountId: 'acc-1',
    name: 'Afiliación',
    opportunityType: 'NEW_MERCHANT',
    probability: 0,
  } as never;

  it('un prospecto sin calificar no puede tener oportunidad (409)', async () => {
    const { service, repo } = servicio(cuenta({ lifecycleStatus: AccountLifecycleStatus.LEAD }));

    await expect(service.createOpportunity(entrada)).rejects.toThrow(ConflictException);
    expect(repo.opportunities.create).not.toHaveBeenCalled();
  });

  it('una cuenta calificada sí', async () => {
    const { service, repo } = servicio(
      cuenta({ lifecycleStatus: AccountLifecycleStatus.QUALIFIED }),
    );

    await service.createOpportunity(entrada);

    expect(repo.opportunities.create).toHaveBeenCalled();
  });
});
