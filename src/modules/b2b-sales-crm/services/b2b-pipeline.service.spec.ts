import { B2BPipelineService } from './b2b-pipeline.service';

/**
 * El listado de contratos tiene que entregar la VERSION, no sólo el contrato.
 *
 * Esta prueba nace de una avería silenciosa: la pantalla de comisiones (MDR) del ERP se alimentaba
 * de este listado y tomaba `id` como `contractVersionId`. Pero la regla de comisión cuelga de
 * `mdr_rules.contract_version_id`, y la versión nace con uuid propio. Con el uuid equivocado,
 * listar reglas devolvía `[]` —la pantalla anunciaba «sin reglas»— y crear una devolvía 404. Nunca
 * se pudo pactar una comisión desde el ERP y nada se puso rojo.
 *
 * Por eso las dos afirmaciones de abajo: que el id de la versión VIAJA, y que es DISTINTO del id
 * del contrato. La segunda es la que impide que el fallo vuelva: sin ella, un `currentVersionId:
 * contract.id` pasaría tan campante.
 */
const build = (contratos: unknown[]) => {
  const repository = {
    contracts: { findAll: jest.fn(async () => contratos) },
    accounts: {},
    contractVersions: {},
  };
  const logger = { infoContext: jest.fn() };
  const service = new B2BPipelineService(repository as never, logger as never);
  return { service, repository };
};

const CONTRATO = {
  id: 'contrato-1',
  contractNumber: 'CTR-2026-0001',
  accountId: 'cuenta-1',
  account: { tradeName: 'Roho Home Center', legalName: 'Roho S.R.L.' },
  status: 'ACTIVE',
  startDate: '2026-01-01',
  endDate: null,
  billingCycle: 'MONTHLY',
  settlementPolicy: 'PER_CONTRACT',
  signedAt: null,
};

describe('B2BPipelineService · listContracts', () => {
  it('entrega la versión VIGENTE —la de número más alto— y no el id del contrato', async () => {
    const { service } = build([
      {
        ...CONTRATO,
        versions: [
          { id: 'version-1', versionNumber: 1 },
          { id: 'version-3', versionNumber: 3 },
          { id: 'version-2', versionNumber: 2 },
        ],
      },
    ]);

    const [fila] = await service.listContracts();

    expect(fila?.currentVersionId).toBe('version-3');
    expect(fila?.currentVersionNumber).toBe(3);
    // La afirmación que cierra la puerta al fallo original.
    expect(fila?.currentVersionId).not.toBe(fila?.id);
  });

  it('un contrato sin versiones no inventa ninguna', async () => {
    const { service } = build([{ ...CONTRATO, versions: [] }]);

    const [fila] = await service.listContracts();

    expect(fila?.currentVersionId).toBeNull();
    expect(fila?.currentVersionNumber).toBeNull();
  });

  it('devuelve la política de liquidación, que la tabla del ERP pinta en su columna', async () => {
    const { service } = build([{ ...CONTRATO, versions: [{ id: 'v-1', versionNumber: 1 }] }]);

    const [fila] = await service.listContracts();

    expect(fila?.settlementPolicy).toBe('PER_CONTRACT');
    expect(fila?.tradeName).toBe('Roho Home Center');
  });
});

/**
 * Decidir una aprobación de una REGLA de comisión (T-7).
 *
 * Una regla por debajo del mínimo nace inactiva y su solicitud `MDR_BELOW_MINIMUM` cuelga de ella
 * (`mdrRuleId`). Aprobar es lo que la activa; sin esa rama la solicitud se podía «aprobar» y la
 * regla se quedaba inactiva para siempre, o —peor— se activaba sin pasar por aquí.
 */
const TX = { id: 'transaccion' };

const buildAprobaciones = (aprobacion: Record<string, unknown> | null) => {
  const fila = aprobacion
    ? { update: jest.fn(async () => undefined), status: 'PENDING', ...aprobacion }
    : null;
  const repository = {
    transaction: jest.fn(async (trabajo: (tx: unknown) => Promise<unknown>) => trabajo(TX)),
    approvalRequests: {
      findByPk: jest.fn(async () => fila),
      findAll: jest.fn(async () => (fila ? [fila] : [])),
    },
    proposals: { update: jest.fn(async () => [1]) },
    mdrRules: { update: jest.fn(async () => [1]) },
  };
  const logger = { infoContext: jest.fn() };
  const service = new B2BPipelineService(repository as never, logger as never);
  return { service, repository, fila };
};

const APROBADOR = { sub: 'aprobador-1' } as never;

describe('B2BPipelineService · decideApproval · aprobación de una regla MDR', () => {
  const APROBACION_DE_REGLA = {
    id: 'aprobacion-1',
    proposalId: null,
    mdrRuleId: 'regla-1',
    approvalType: 'MDR_BELOW_MINIMUM',
  };

  it('aprobarla ACTIVA la regla, dentro de la misma transacción que la decisión', async () => {
    const { service, repository, fila } = buildAprobaciones(APROBACION_DE_REGLA);

    await service.decideApproval(
      'aprobacion-1',
      { status: 'APPROVED', reason: 'Cliente ancla' } as never,
      APROBADOR,
    );

    expect(repository.mdrRules.update).toHaveBeenCalledWith(
      { isActive: true },
      { where: { id: 'regla-1' }, transaction: TX },
    );
    expect(fila?.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'APPROVED', approvedByUserId: 'aprobador-1' }),
      { transaction: TX },
    );
    expect(repository.proposals.update).not.toHaveBeenCalled();
  });

  it('rechazarla NO activa la regla: se queda inactiva y no cobra', async () => {
    const { service, repository } = buildAprobaciones(APROBACION_DE_REGLA);

    await service.decideApproval(
      'aprobacion-1',
      { status: 'REJECTED', reason: 'Fuera de política' } as never,
      APROBADOR,
    );

    expect(repository.mdrRules.update).not.toHaveBeenCalled();
  });

  it('una aprobación ya decidida (409) no vuelve a activar la regla', async () => {
    const { service, repository } = buildAprobaciones({
      ...APROBACION_DE_REGLA,
      status: 'REJECTED',
    });

    await expect(
      service.decideApproval(
        'aprobacion-1',
        { status: 'APPROVED', reason: 'Ahora sí' } as never,
        APROBADOR,
      ),
    ).rejects.toThrow('ya fue decidida');

    expect(repository.mdrRules.update).not.toHaveBeenCalled();
  });

  it('la aprobación de una PROPUESTA sigue igual y no toca ninguna regla', async () => {
    const { service, repository } = buildAprobaciones({
      id: 'aprobacion-2',
      proposalId: 'propuesta-1',
      mdrRuleId: null,
      approvalType: 'MDR_BELOW_MINIMUM',
    });

    await service.decideApproval(
      'aprobacion-2',
      { status: 'APPROVED', reason: 'Visto bueno' } as never,
      APROBADOR,
    );

    expect(repository.proposals.update).toHaveBeenCalledWith(
      { status: 'DRAFT' },
      { where: { id: 'propuesta-1', status: 'PENDING_APPROVAL' }, transaction: TX },
    );
    expect(repository.mdrRules.update).not.toHaveBeenCalled();
  });

  it('la cola de aprobaciones dice de qué regla es cada solicitud', async () => {
    const { service } = buildAprobaciones({
      ...APROBACION_DE_REGLA,
      contractVersionId: 'version-1',
      reason: 'x',
      requestedByUserId: 'u',
    });

    const [fila] = await service.listApprovals(true);

    expect(fila?.mdrRuleId).toBe('regla-1');
  });
});
