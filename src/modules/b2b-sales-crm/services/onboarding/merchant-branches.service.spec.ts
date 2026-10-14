import { build, fila } from './onboarding.fixtures';

describe('MerchantBranchesService · sucursales: la bandera de crédito sigue la regla única', () => {
  function conSucursal(branchOver: Record<string, unknown>, lifecycleStatus: string) {
    const built = build();
    const branch = fila({
      id: 'br-1',
      accountId: 'acc-1',
      name: 'Casa matriz',
      status: 'INACTIVE',
      canOriginateBnpl: false,
      bnplBlockedByAtlas: false,
      activatedAt: new Date('2026-10-01T00:00:00Z'),
      ...branchOver,
    });
    Object.assign(built.repository, { branches: { findByPk: jest.fn(async () => branch) } });
    built.repository.accounts.findByPk = jest.fn(async () => ({
      id: 'acc-1',
      lifecycleStatus,
    })) as never;
    return { ...built, branch };
  }

  it('dar de alta una sucursal de un comercio APROBADO la deja vendiendo', async () => {
    const { branches, branch } = conSucursal({}, 'CUSTOMER');
    await branches.setBranchStatus('br-1', { status: 'ACTIVE' } as never);
    expect(branch.canOriginateBnpl).toBe(true);
  });

  it('en un comercio aún no aprobado queda «Por habilitar»', async () => {
    const { branches, branch } = conSucursal({}, 'QUALIFIED');
    await branches.setBranchStatus('br-1', { status: 'ACTIVE' } as never);
    expect(branch.canOriginateBnpl).toBe(false);
  });

  it('si Atlas la apagó a mano, darla de alta no la reenciende', async () => {
    const { branches, branch } = conSucursal({ bnplBlockedByAtlas: true }, 'CUSTOMER');
    await branches.setBranchStatus('br-1', { status: 'ACTIVE' } as never);
    expect(branch.canOriginateBnpl).toBe(false);
  });

  it('darla de baja le quita el crédito siempre', async () => {
    const { branches, branch } = conSucursal(
      { status: 'ACTIVE', canOriginateBnpl: true },
      'CUSTOMER',
    );
    await branches.setBranchStatus('br-1', { status: 'INACTIVE' } as never);
    expect(branch.canOriginateBnpl).toBe(false);
  });

  it('Atlas apaga a mano: queda marcada y la regla no la toca; al encenderla se levanta la marca', async () => {
    const apagar = conSucursal({ status: 'ACTIVE', canOriginateBnpl: true }, 'CUSTOMER');
    await apagar.branches.updateBranch('br-1', { canOriginateBnpl: false } as never);
    expect(apagar.branch).toMatchObject({ canOriginateBnpl: false, bnplBlockedByAtlas: true });

    const encender = conSucursal({ status: 'ACTIVE', bnplBlockedByAtlas: true }, 'CUSTOMER');
    await encender.branches.updateBranch('br-1', { canOriginateBnpl: true } as never);
    expect(encender.branch).toMatchObject({ canOriginateBnpl: true, bnplBlockedByAtlas: false });
  });

  it('editar otros datos no toca ni la bandera ni la marca', async () => {
    const { branches, branch } = conSucursal(
      { status: 'ACTIVE', canOriginateBnpl: true },
      'CUSTOMER',
    );
    await branches.updateBranch('br-1', { name: 'Otro nombre' } as never);
    expect(branch).toMatchObject({
      name: 'Otro nombre',
      canOriginateBnpl: true,
      bnplBlockedByAtlas: false,
    });
  });
});
