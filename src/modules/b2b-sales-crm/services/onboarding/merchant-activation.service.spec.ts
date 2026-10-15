import { ConflictException } from '@nestjs/common';
import { build } from './onboarding.fixtures';

describe('MerchantActivationService · la compuerta dura', () => {
  it('sin APROBADO del Motor no activa, y lo dice antes que el checklist', async () => {
    const { activation } = build({ caso: { checklistItems: [{ status: 'PENDING' }] } });
    await expect(activation.activateOnboardingCase('caso-1')).rejects.toThrow(
      /verificación del Motor/,
    );
  });

  it('con el Motor en contra tampoco, y nombra el desenlace', async () => {
    const { activation } = build({
      caso: { decisionOutcome: 'RECHAZADO', checklistItems: [{ status: 'COMPLETED' }] },
    });
    await expect(activation.activateOnboardingCase('caso-1')).rejects.toThrow(/RECHAZADO/);
  });
});

describe('MerchantActivationService · activar el comercio habilita la venta a crédito de sus sucursales', () => {
  function activable() {
    const built = build({
      caso: { decisionOutcome: 'APROBADO', checklistItems: [{ status: 'COMPLETED' }] },
    });
    const branches = { update: jest.fn(async () => [1]) };
    Object.assign(built.repository, { branches });
    built.repository.findActiveContractVersion = jest.fn(async () => ({ id: 'cv-1' }) as never);
    jest.spyOn(built.caseQuery, 'getOnboardingCase').mockResolvedValue({ id: 'caso-1' } as never);
    return { ...built, branches };
  }
  type Llamada = [Record<string, unknown>, { where: Record<string, unknown> }];
  const llamadas = (branches: { update: jest.Mock }) =>
    branches.update.mock.calls as unknown as Llamada[];

  it('las PENDING pasan a ACTIVE con su fecha de alta', async () => {
    const { activation, branches } = activable();
    await activation.activateOnboardingCase('caso-1');
    const [valores, opciones] = llamadas(branches)[0] as Llamada;
    expect(valores).toEqual({ status: 'ACTIVE', activatedAt: expect.any(Date) });
    expect(opciones.where).toEqual({ accountId: 'acc-1', status: 'PENDING' });
  });

  it('TODAS las ACTIVE sin la capacidad la reciben —también las que ya lo estaban—, sin reescribir su fecha', async () => {
    const { activation, branches } = activable();
    await activation.activateOnboardingCase('caso-1');
    const [valores, opciones] = llamadas(branches)[1] as Llamada;
    expect(valores).toEqual({ canOriginateBnpl: true });
    expect(opciones.where).toMatchObject({
      accountId: 'acc-1',
      status: 'ACTIVE',
      canOriginateBnpl: false,
    });
  });

  it('las que Atlas apagó a mano NO se reencienden al activar', async () => {
    const { activation, branches } = activable();
    await activation.activateOnboardingCase('caso-1');
    const [, opciones] = llamadas(branches)[1] as Llamada;
    expect(opciones.where.bnplBlockedByAtlas).toBe(false);
  });

  it('sin APROBADO del Motor no habilita ninguna: la compuerta dura corta antes', async () => {
    const built = build({ caso: { decisionOutcome: null } });
    const branches = { update: jest.fn() };
    Object.assign(built.repository, { branches });
    await expect(built.activation.activateOnboardingCase('caso-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(branches.update).not.toHaveBeenCalled();
  });
});
