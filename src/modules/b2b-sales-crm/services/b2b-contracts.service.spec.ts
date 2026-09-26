import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { env } from '../../../config/env';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { B2BContractsService } from './b2b-contracts.service';

/**
 * Las reglas de comisión (MDR) son lo que de verdad se cobra, y hasta ahora aceptaban cualquier
 * tarifa de 0 a 100 sin aprobación: el mínimo global (`DEFAULT_MIN_MDR_RATE_PERCENT`) sólo se
 * comprobaba al crear PROPUESTAS. Además `updateMdrRule` no comprobaba piso <= techo, y con piso >
 * techo el `clamp` del cobro devuelve siempre el techo.
 *
 * Cada prueba de abajo se escribió para FALLAR sin su arreglo (ver el informe de esta tarea): si una
 * pasa con el arreglo quitado, ya no vigila nada.
 */

const MINIMO = env.DEFAULT_MIN_MDR_RATE_PERCENT;
const BAJO_EL_MINIMO = MINIMO - 1;
const SOBRE_EL_MINIMO = MINIMO + 1;
const TX = { id: 'transaccion' };
const USUARIO = { sub: 'usuario-1' } as AuthUser;
const MOTIVO = 'Comercio ancla: acordado con dirección comercial.';

interface ReglaGuardada {
  id: string;
  contractVersionId: string;
  ratePercent: string;
  minFeeAmount: string | null;
  maxFeeAmount: string | null;
  isActive: boolean;
  update: jest.Mock;
}

/** Una fila `mdr_rules` tal como la devuelve la base: los decimales llegan como TEXTO. */
const reglaGuardada = (sobre: Partial<ReglaGuardada> = {}): ReglaGuardada => {
  const regla: ReglaGuardada = {
    id: 'regla-1',
    contractVersionId: 'version-1',
    ratePercent: '3.000000',
    minFeeAmount: null,
    maxFeeAmount: null,
    isActive: true,
    update: jest.fn(),
    ...sobre,
  };
  regla.update.mockImplementation(async (cambios: Partial<ReglaGuardada>) => {
    Object.assign(regla, cambios);
    return regla;
  });
  return regla;
};

interface Opciones {
  version?: unknown;
  regla?: ReglaGuardada | null;
  pendiente?: unknown;
}

const build = ({
  version = { id: 'version-1' },
  regla = null,
  pendiente = null,
}: Opciones = {}) => {
  const repository = {
    transaction: jest.fn(async (trabajo: (tx: unknown) => Promise<unknown>) => trabajo(TX)),
    contractVersions: { findByPk: jest.fn(async () => version) },
    mdrRules: {
      create: jest.fn(async (fila: Record<string, unknown>) => ({ id: 'regla-nueva', ...fila })),
      findByPk: jest.fn(async () => regla),
    },
    approvalRequests: {
      create: jest.fn(async (fila: Record<string, unknown>) => ({ id: 'aprobacion-1', ...fila })),
      findOne: jest.fn(async () => pendiente),
    },
    // T-10: publishMdrUpdatedForContractVersion lo consulta ANTES de publicar al outbox. Sin
    // contrato, no hay cuenta que resolver y no se publica nada — estas pruebas no ejercitan T-10.
    contracts: { findByPk: jest.fn(async () => null) },
    accounts: { findByPk: jest.fn(async () => null) },
    eventOutbox: { create: jest.fn(async (fila: Record<string, unknown>) => ({ id: 1, ...fila })) },
  };
  const logger = { infoContext: jest.fn() };
  const service = new B2BContractsService(repository as never, logger as never);
  return { service, repository };
};

const nuevaRegla = (sobre: Record<string, unknown> = {}) => ({
  contractVersionId: 'version-1',
  ratePercent: SOBRE_EL_MINIMO,
  ...sobre,
});

describe('B2BContractsService · createMdrRule · el mínimo global (T-7)', () => {
  it('una tarifa sobre el mínimo nace activa y no abre ninguna aprobación', async () => {
    const { service, repository } = build();

    const resultado = await service.createMdrRule(nuevaRegla() as never, USUARIO);

    expect(repository.mdrRules.create).toHaveBeenCalledWith(
      expect.objectContaining({ ratePercent: SOBRE_EL_MINIMO, isActive: true }),
      { transaction: TX },
    );
    expect(repository.approvalRequests.create).not.toHaveBeenCalled();
    expect(resultado).toEqual({ id: 'regla-nueva', ratePercent: SOBRE_EL_MINIMO, isActive: true });
  });

  it('una tarifa IGUAL al mínimo no es una excepción: la propuesta también pide «menor», no «menor o igual»', async () => {
    const { service, repository } = build();

    await service.createMdrRule(nuevaRegla({ ratePercent: MINIMO }) as never, USUARIO);

    expect(repository.approvalRequests.create).not.toHaveBeenCalled();
    expect(repository.mdrRules.create).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true }),
      expect.anything(),
    );
  });

  it('por debajo del mínimo y sin motivo se rechaza con 400 y no se escribe NADA', async () => {
    const { service, repository } = build();

    await expect(
      service.createMdrRule(nuevaRegla({ ratePercent: BAJO_EL_MINIMO }) as never, USUARIO),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.mdrRules.create).not.toHaveBeenCalled();
    expect(repository.approvalRequests.create).not.toHaveBeenCalled();
  });

  it('por debajo del mínimo con motivo la regla nace INACTIVA y abre la aprobación MDR_BELOW_MINIMUM', async () => {
    const { service, repository } = build();

    const resultado = await service.createMdrRule(
      nuevaRegla({ ratePercent: BAJO_EL_MINIMO, pricingExceptionReason: MOTIVO }) as never,
      USUARIO,
    );

    // Inactiva: una regla inactiva no se elige al cobrar, así que no cobra por debajo del mínimo
    // mientras nadie la firme.
    expect(repository.mdrRules.create).toHaveBeenCalledWith(
      expect.objectContaining({ ratePercent: BAJO_EL_MINIMO, isActive: false }),
      { transaction: TX },
    );
    // La MISMA solicitud que crea una propuesta: mismo tipo, mismo estado inicial, y ahora
    // colgada de la regla para que la decisión sepa qué activar.
    expect(repository.approvalRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalType: 'MDR_BELOW_MINIMUM',
        status: 'PENDING',
        mdrRuleId: 'regla-nueva',
        contractVersionId: 'version-1',
        requestedByUserId: 'usuario-1',
        reason: expect.stringContaining(MOTIVO),
      }),
      { transaction: TX },
    );
    expect(resultado).toMatchObject({ isActive: false, approvalRequestId: 'aprobacion-1' });
  });

  it('el motivo no se descarta: viaja a la solicitud junto a la tarifa pedida y el mínimo', async () => {
    const { service, repository } = build();

    await service.createMdrRule(
      nuevaRegla({ ratePercent: BAJO_EL_MINIMO, pricingExceptionReason: MOTIVO }) as never,
      USUARIO,
    );

    const fila = repository.approvalRequests.create.mock.calls[0]?.[0] as { reason: string };
    expect(fila.reason).toContain(String(BAJO_EL_MINIMO));
    expect(fila.reason).toContain(String(MINIMO));
  });

  it('una versión contractual inexistente sigue siendo 404, antes de hablar de tarifas', async () => {
    const { service, repository } = build({ version: null });

    await expect(
      service.createMdrRule(nuevaRegla({ ratePercent: BAJO_EL_MINIMO }) as never, USUARIO),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.mdrRules.create).not.toHaveBeenCalled();
  });
});

describe('B2BContractsService · updateMdrRule · el mínimo global (T-7)', () => {
  it('bajar la tarifa por debajo del mínimo sin motivo se rechaza con 400 y la regla no cambia', async () => {
    const regla = reglaGuardada();
    const { service, repository } = build({ regla });

    await expect(
      service.updateMdrRule('regla-1', { ratePercent: BAJO_EL_MINIMO }, USUARIO),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(regla.update).not.toHaveBeenCalled();
    expect(regla.ratePercent).toBe('3.000000');
    expect(repository.approvalRequests.create).not.toHaveBeenCalled();
  });

  it('bajarla con motivo guarda la tarifa pero deja la regla INACTIVA y abre la aprobación', async () => {
    const regla = reglaGuardada();
    const { service, repository } = build({ regla });

    const resultado = await service.updateMdrRule(
      'regla-1',
      { ratePercent: BAJO_EL_MINIMO, pricingExceptionReason: MOTIVO },
      USUARIO,
    );

    expect(regla.update).toHaveBeenCalledWith(
      { ratePercent: BAJO_EL_MINIMO, isActive: false },
      { transaction: TX },
    );
    expect(repository.approvalRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalType: 'MDR_BELOW_MINIMUM',
        status: 'PENDING',
        mdrRuleId: 'regla-1',
        contractVersionId: 'version-1',
        requestedByUserId: 'usuario-1',
      }),
      { transaction: TX },
    );
    expect(resultado).toMatchObject({ isActive: false, approvalRequestId: 'aprobacion-1' });
  });

  it('subir la tarifa o dejarla sobre el mínimo no pide nada y no toca el estado', async () => {
    const regla = reglaGuardada();
    const { service, repository } = build({ regla });

    await service.updateMdrRule('regla-1', { ratePercent: SOBRE_EL_MINIMO }, USUARIO);

    expect(regla.update).toHaveBeenCalledWith(
      { ratePercent: SOBRE_EL_MINIMO },
      { transaction: TX },
    );
    expect(repository.approvalRequests.create).not.toHaveBeenCalled();
  });

  it('activar una regla inactiva que YA está por debajo del mínimo también pide excepción', async () => {
    const regla = reglaGuardada({ ratePercent: String(BAJO_EL_MINIMO), isActive: false });
    const { service, repository } = build({ regla });

    await expect(
      service.updateMdrRule('regla-1', { isActive: true }, USUARIO),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(regla.update).not.toHaveBeenCalled();

    const resultado = await service.updateMdrRule(
      'regla-1',
      { isActive: true, pricingExceptionReason: MOTIVO },
      USUARIO,
    );

    // Se queda inactiva: activarla es justo lo que el aprobador decide.
    expect(regla.update).toHaveBeenCalledWith({ isActive: false }, { transaction: TX });
    expect(repository.approvalRequests.create).toHaveBeenCalledTimes(1);
    expect(resultado).toMatchObject({ isActive: false, approvalRequestId: 'aprobacion-1' });
  });

  it('desactivar una regla por debajo del mínimo nunca pide excepción: dejar de cobrar así siempre se puede', async () => {
    const regla = reglaGuardada({ ratePercent: String(BAJO_EL_MINIMO) });
    const { service, repository } = build({ regla });

    await service.updateMdrRule('regla-1', { isActive: false }, USUARIO);

    expect(regla.update).toHaveBeenCalledWith({ isActive: false }, { transaction: TX });
    expect(repository.approvalRequests.create).not.toHaveBeenCalled();
  });

  it('bajar la tarifa Y desactivar a la vez tampoco pide excepción: una regla inactiva no cobra', async () => {
    const regla = reglaGuardada();
    const { service, repository } = build({ regla });

    await service.updateMdrRule(
      'regla-1',
      { ratePercent: BAJO_EL_MINIMO, isActive: false },
      USUARIO,
    );

    expect(regla.update).toHaveBeenCalledWith(
      { ratePercent: BAJO_EL_MINIMO, isActive: false },
      { transaction: TX },
    );
    expect(repository.approvalRequests.create).not.toHaveBeenCalled();
  });

  it('editar sólo los montos de una regla activa que no cambia de tarifa ni de estado no pide excepción', async () => {
    // Una regla heredada, activa y ya por debajo del mínimo: editarle el piso no la hace «nueva».
    const regla = reglaGuardada({ ratePercent: String(BAJO_EL_MINIMO) });
    const { service, repository } = build({ regla });

    await service.updateMdrRule('regla-1', { minFeeAmount: 5 }, USUARIO);

    expect(regla.update).toHaveBeenCalledWith({ minFeeAmount: 5 }, { transaction: TX });
    expect(repository.approvalRequests.create).not.toHaveBeenCalled();
  });

  it('reenviar la MISMA tarifa por debajo del mínimo en una regla ya activa no cuenta como bajarla', async () => {
    const regla = reglaGuardada({ ratePercent: '1.500000' });
    const { service, repository } = build({ regla });

    await service.updateMdrRule('regla-1', { ratePercent: 1.5 }, USUARIO);

    expect(repository.approvalRequests.create).not.toHaveBeenCalled();
  });

  it('una regla que espera una aprobación no admite más ediciones (409): lo firmado es lo que se activa', async () => {
    const regla = reglaGuardada({ ratePercent: String(BAJO_EL_MINIMO), isActive: false });
    const { service, repository } = build({ regla, pendiente: { id: 'aprobacion-previa' } });

    await expect(
      service.updateMdrRule(
        'regla-1',
        { ratePercent: 0.5, pricingExceptionReason: MOTIVO },
        USUARIO,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(regla.update).not.toHaveBeenCalled();
    expect(repository.approvalRequests.create).not.toHaveBeenCalled();
    // La pregunta se hace por LA REGLA y sólo por lo pendiente.
    expect(repository.approvalRequests.findOne).toHaveBeenCalledWith({
      where: { mdrRuleId: 'regla-1', status: 'PENDING' },
    });
  });

  it('una regla inexistente sigue siendo 404', async () => {
    const { service } = build({ regla: null });

    await expect(
      service.updateMdrRule('nada', { ratePercent: SOBRE_EL_MINIMO }, USUARIO),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('B2BContractsService · piso <= techo (T-8)', () => {
  it('al crear: piso mayor que techo se rechaza con 409 y no se escribe nada', async () => {
    const { service, repository } = build();

    await expect(
      service.createMdrRule(nuevaRegla({ minFeeAmount: 50, maxFeeAmount: 10 }) as never, USUARIO),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.mdrRules.create).not.toHaveBeenCalled();
  });

  it('al crear: piso IGUAL al techo es válido (cobra un monto fijo)', async () => {
    const { service, repository } = build();

    await service.createMdrRule(
      nuevaRegla({ minFeeAmount: 10, maxFeeAmount: 10 }) as never,
      USUARIO,
    );

    expect(repository.mdrRules.create).toHaveBeenCalled();
  });

  it('al editar: subir SÓLO el piso por encima del techo YA GUARDADO se rechaza', async () => {
    const regla = reglaGuardada({ minFeeAmount: '10.00', maxFeeAmount: '50.00' });
    const { service } = build({ regla });

    await expect(
      service.updateMdrRule('regla-1', { minFeeAmount: 60 }, USUARIO),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(regla.update).not.toHaveBeenCalled();
  });

  it('al editar: bajar SÓLO el techo por debajo del piso YA GUARDADO se rechaza', async () => {
    const regla = reglaGuardada({ minFeeAmount: '10.00', maxFeeAmount: '50.00' });
    const { service } = build({ regla });

    await expect(
      service.updateMdrRule('regla-1', { maxFeeAmount: 5 }, USUARIO),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(regla.update).not.toHaveBeenCalled();
  });

  it('al editar: los dos llegan invertidos en el cuerpo y se rechaza', async () => {
    const regla = reglaGuardada();
    const { service } = build({ regla });

    await expect(
      service.updateMdrRule('regla-1', { minFeeAmount: 30, maxFeeAmount: 20 }, USUARIO),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(regla.update).not.toHaveBeenCalled();
  });

  it('al editar: los montos guardados llegan como TEXTO decimal y se comparan como números', async () => {
    // Como texto, «200» > «1000.00» (compara carácter a carácter) y se rechazaría un piso válido;
    // como número, 200 <= 1000 pasa y 2000 > 1000 se rechaza.
    const regla = reglaGuardada({ minFeeAmount: '100.00', maxFeeAmount: '1000.00' });
    const { service } = build({ regla });

    await service.updateMdrRule('regla-1', { minFeeAmount: 200 }, USUARIO);
    await service.updateMdrRule('regla-1', { minFeeAmount: 1000 }, USUARIO);
    expect(regla.update).toHaveBeenCalledTimes(2);

    await expect(
      service.updateMdrRule('regla-1', { minFeeAmount: 2000 }, USUARIO),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(regla.update).toHaveBeenCalledTimes(2);
  });

  it('al editar: poner el techo a null lo quita y no hay nada que comparar', async () => {
    const regla = reglaGuardada({ minFeeAmount: '10.00', maxFeeAmount: '50.00' });
    const { service } = build({ regla });

    await service.updateMdrRule('regla-1', { maxFeeAmount: null }, USUARIO);

    expect(regla.update).toHaveBeenCalledWith({ maxFeeAmount: null }, { transaction: TX });
  });

  it('al editar sin tocar los montos, una regla heredada con piso > techo aún se puede desactivar', async () => {
    // La validación es de lo que se ESCRIBE: si no, la regla rota que hay que apagar quedaría
    // encendida porque apagarla también «viola» el piso.
    const regla = reglaGuardada({ minFeeAmount: '80.00', maxFeeAmount: '20.00' });
    const { service } = build({ regla });

    await service.updateMdrRule('regla-1', { isActive: false }, USUARIO);

    expect(regla.update).toHaveBeenCalledWith({ isActive: false }, { transaction: TX });
  });

  it('reactivar una regla heredada con piso > techo se rechaza con 409: encenderla cobraría siempre el techo', async () => {
    const regla = reglaGuardada({ isActive: false, minFeeAmount: '80.00', maxFeeAmount: '20.00' });
    const { service } = build({ regla });

    await expect(service.updateMdrRule('regla-1', { isActive: true }, USUARIO)).rejects.toThrow(
      ConflictException,
    );
    expect(regla.update).not.toHaveBeenCalled();
  });

  it('reactivar una regla sana (piso <= techo, tarifa sobre el mínimo) sigue funcionando', async () => {
    const regla = reglaGuardada({ isActive: false, minFeeAmount: '10.00', maxFeeAmount: '50.00' });
    const { service } = build({ regla });

    await service.updateMdrRule('regla-1', { isActive: true }, USUARIO);

    expect(regla.update).toHaveBeenCalledWith({ isActive: true }, { transaction: TX });
  });
});
