import { ACCOUNT_ID, actor, buildHarness } from '../portal.harness';

describe('PortalBranchCommandService', () => {
  describe('sucursales · quién puede vender a crédito (regla única)', () => {
    const BRANCH_ID = '77777777-7777-4777-8777-777777777777';

    function sucursal(over: Record<string, unknown> = {}) {
      const row: Record<string, unknown> & { update: jest.Mock } = {
        id: BRANCH_ID,
        accountId: ACCOUNT_ID,
        name: 'Casa matriz',
        city: null,
        address: null,
        status: 'INACTIVE',
        canOriginateBnpl: false,
        bnplBlockedByAtlas: false,
        activatedAt: new Date('2026-10-01T00:00:00Z'),
        update: jest.fn(),
        ...over,
      };
      row.update.mockImplementation(async (patch: Record<string, unknown>) =>
        Object.assign(row, patch),
      );
      return row;
    }

    async function crearSucursal(lifecycleStatus: string | null) {
      const harness = buildHarness();
      harness.accountModel.findByPk.mockResolvedValue(
        lifecycleStatus ? { id: ACCOUNT_ID, lifecycleStatus } : null,
      );
      await harness.branches.createBranch({ name: 'Tienda nueva' } as never, actor);
      return harness.branchModel.create.mock.calls[0]?.[0] as Record<string, unknown>;
    }

    async function cambiarEstado(
      over: Record<string, unknown>,
      status: string,
      lifecycleStatus: string,
    ) {
      const harness = buildHarness();
      const branch = sucursal(over);
      harness.branchModel.findByPk.mockResolvedValue(branch);
      harness.accountModel.findByPk.mockResolvedValue({ id: ACCOUNT_ID, lifecycleStatus });
      await harness.branches.setBranchStatus(BRANCH_ID, { status } as never, actor);
      return branch;
    }

    it('una sucursal nueva de un comercio APROBADO nace vendiendo a crédito', async () => {
      expect((await crearSucursal('CUSTOMER')).canOriginateBnpl).toBe(true);
    });

    it('una sucursal nueva de un comercio que Atlas aún no aprobó nace «Por habilitar»', async () => {
      expect((await crearSucursal('QUALIFIED')).canOriginateBnpl).toBe(false);
      expect((await crearSucursal('LEAD')).canOriginateBnpl).toBe(false);
    });

    it('si la cuenta no existe, ante la duda no vende', async () => {
      expect((await crearSucursal(null)).canOriginateBnpl).toBe(false);
    });

    it('dar de baja y de alta ya no la deja sin crédito para siempre cuando el comercio está aprobado', async () => {
      const branch = await cambiarEstado(
        { status: 'INACTIVE', canOriginateBnpl: false },
        'ACTIVE',
        'CUSTOMER',
      );
      expect(branch.canOriginateBnpl).toBe(true);
    });

    it('reactivarla NO vende si Atlas la apagó a mano', async () => {
      const branch = await cambiarEstado(
        { status: 'INACTIVE', canOriginateBnpl: false, bnplBlockedByAtlas: true },
        'ACTIVE',
        'CUSTOMER',
      );
      expect(branch.canOriginateBnpl).toBe(false);
    });

    it('reactivarla en un comercio no aprobado sigue en «Por habilitar»', async () => {
      const branch = await cambiarEstado(
        { status: 'INACTIVE', canOriginateBnpl: false },
        'ACTIVE',
        'QUALIFIED',
      );
      expect(branch.canOriginateBnpl).toBe(false);
    });

    it('dada de baja nunca vende, aunque el comercio esté aprobado', async () => {
      const branch = await cambiarEstado(
        { status: 'ACTIVE', canOriginateBnpl: true },
        'INACTIVE',
        'CUSTOMER',
      );
      expect(branch.canOriginateBnpl).toBe(false);
    });

    it('no pisa lo que Atlas ya había concedido a mano en un comercio aún no aprobado', async () => {
      const branch = await cambiarEstado(
        { status: 'INACTIVE', canOriginateBnpl: true },
        'ACTIVE',
        'QUALIFIED',
      );
      expect(branch.canOriginateBnpl).toBe(true);
    });

    it('el mismo estado no escribe nada', async () => {
      const harness = buildHarness();
      const branch = sucursal({ status: 'ACTIVE', canOriginateBnpl: false });
      harness.branchModel.findByPk.mockResolvedValue(branch);
      await harness.branches.setBranchStatus(BRANCH_ID, { status: 'ACTIVE' } as never, actor);
      expect(branch.update).not.toHaveBeenCalled();
    });
  });
});
